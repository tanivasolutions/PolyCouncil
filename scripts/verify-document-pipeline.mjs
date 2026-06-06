/**
 * End-to-end document pipeline verification (Node + fake-indexeddb).
 * Run: node scripts/verify-document-pipeline.mjs
 */

import "fake-indexeddb/auto";
import * as XLSX from "xlsx";

// FileReader polyfill for Node (documentStore / processors)
class FileReaderPolyfill {
  constructor() {
    this.result = null;
    this.error = null;
    this.onload = null;
    this.onerror = null;
  }

  _finish() {
    queueMicrotask(() => this.onload?.({ target: this }));
  }

  _fail(err) {
    this.error = err;
    queueMicrotask(() => this.onerror?.({ target: this }));
  }

  readAsText(file) {
    file
      .text()
      .then((text) => {
        this.result = text;
        this._finish();
      })
      .catch((err) => this._fail(err));
  }

  readAsArrayBuffer(file) {
    file
      .arrayBuffer()
      .then((buffer) => {
        this.result = buffer;
        this._finish();
      })
      .catch((err) => this._fail(err));
  }

  readAsDataURL(file) {
    file
      .arrayBuffer()
      .then((buffer) => {
        const bytes = new Uint8Array(buffer);
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        const mime = file.type || "application/octet-stream";
        this.result = `data:${mime};base64,${btoa(binary)}`;
        this._finish();
      })
      .catch((err) => this._fail(err));
  }
}

globalThis.FileReader = FileReaderPolyfill;
import { REID, LEO, MASON } from "../src/agents.js";
import { BUSINESSES } from "../src/businesses/index.js";
import {
  buildDocumentContext,
  buildPortfolioDocumentContext,
  isDocumentRelevantToAgent,
} from "../documents/contextBuilder.js";
import {
  deleteDocument,
  getDocument,
  initDocumentDB,
  listDocuments,
  saveDocument,
} from "../documents/documentStore.js";
import { processFile } from "../documents/processors.js";
import { suggestTagsFromText, getScanTextForTags } from "../documents/documents-ui.js";
import { normalizeSpreadsheetPayload } from "../documents/spreadsheet.js";

// ── localStorage polyfill ───────────────────────────────────────────────────

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
};

// ── helpers (mirrors src/app.js message building) ───────────────────────────

function buildUserMessageContent(userMessage, mediaBlocks = []) {
  if (!mediaBlocks.length) {
    return userMessage;
  }

  const blocks = [...mediaBlocks];

  if (typeof userMessage === "string") {
    if (userMessage.trim()) {
      blocks.push({ type: "text", text: userMessage });
    }
  } else if (Array.isArray(userMessage)) {
    blocks.push(...userMessage);
  } else if (userMessage != null) {
    blocks.push({ type: "text", text: String(userMessage) });
  }

  if (blocks.length === 1 && blocks[0].type === "text") {
    return blocks[0].text;
  }

  return blocks;
}

function makeFile(name, content, type = "application/octet-stream") {
  return new File([content], name, { type });
}

const MINIMAL_PDF = `%PDF-1.0
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj
xref
0 4
trailer<</Root 1 0 R>>
startxref
0
%%EOF`;

const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function makePngFile() {
  const bytes = Uint8Array.from(atob(PNG_1X1_BASE64), (c) => c.charCodeAt(0));
  return makeFile("carrier-logo.png", bytes, "image/png");
}

function makeXlsxFile() {
  const wb = XLSX.utils.book_new();
  const rows = [
    { Carrier: "ABC Freight", Rate: 2.45, Lane: "DAL-CHI" },
    { Carrier: "XYZ Logistics", Rate: 2.62, Lane: "ATL-MEM" },
    { Carrier: "Iron Haul", Rate: 2.38, Lane: "BHM-NSH" },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Load Rates");
  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return makeFile(
    "load-rate-history.xlsx",
    buffer,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

async function buildAgentSystemPrompt(agent, businessId, agentName) {
  const docContext = await buildDocumentContext(businessId, agentName);
  return agent.buildContext({ portfolio: false, facts: [] }, BUSINESSES[businessId], docContext);
}

function metaKey(businessId) {
  return `docs_meta_${businessId}`;
}

function readMeta(businessId) {
  const raw = localStorage.getItem(metaKey(businessId));
  return raw ? JSON.parse(raw) : [];
}

// ── test runner ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  OK: ${message}`);
    passed += 1;
    return;
  }
  console.error(`  FAIL: ${message}`);
  failed += 1;
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

async function clearAllDocuments() {
  localStorage.clear();
  await initDocumentDB();
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open("icc_documents");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    const os = tx.objectStore("files");
    const req = os.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  db.close();
}

// ── tests ───────────────────────────────────────────────────────────────────

await clearAllDocuments();

// 1. Markdown → Iron City Cargo
section("1. Markdown upload — Iron City Cargo");

const mdContent = `# Q1 Revenue Summary

Cash flow and invoice totals for Iron City Cargo carriers.
Revenue increased 12% with improved lane rate per mile.`;

const mdFile = makeFile("icc-revenue.md", mdContent, "text/markdown");
const mdProcessed = await processFile(mdFile);
const mdScan = getScanTextForTags(mdProcessed, mdFile);
const mdSuggested = suggestTagsFromText(mdScan || mdContent.slice(0, 500));

assert(mdSuggested.includes("financial"), "MD tag scan suggests financial");
assert(mdSuggested.includes("rates"), "MD tag scan suggests rates");

const mdDocId = await saveDocument("iron-city-cargo", mdFile, {
  name: "ICC Revenue Q1",
  type: "text/markdown",
  description: "Quarterly revenue notes",
  tags: ["financial", "rates", "all"],
});

const iccList = await listDocuments("iron-city-cargo");
assert(iccList.some((d) => d.docId === mdDocId), "MD appears in ICC document list");

const reidPrompt = await buildAgentSystemPrompt(REID, "iron-city-cargo", "Reid");
assert(reidPrompt.includes("BUSINESS DOCUMENTS"), "Reid prompt has BUSINESS DOCUMENTS");
assert(reidPrompt.includes("ICC Revenue Q1"), "Reid prompt includes document name");
assert(reidPrompt.includes("Q1 Revenue Summary"), "Reid prompt includes MD body text");

// 2. PDF → Taniva (base64 + document block)
section("2. PDF upload — Taniva");

const pdfFile = makeFile("benefits-overview.pdf", MINIMAL_PDF, "application/pdf");
const pdfDocId = await saveDocument("taniva", pdfFile, {
  name: "Benefits Overview",
  type: "application/pdf",
  description: "Plan summary PDF",
  tags: ["compliance", "all"],
});

const tanivaList = await listDocuments("taniva");
assert(tanivaList.some((d) => d.docId === pdfDocId), "PDF in Taniva list");

const pdfRecord = await getDocument(pdfDocId);
const pdfPayload = pdfRecord.content;
assert(
  typeof pdfPayload === "string" && pdfPayload.length > 20,
  "PDF stored as base64 string in IndexedDB"
);
assert(!pdfPayload.startsWith("%PDF"), "PDF payload is base64 not raw bytes text");

const tanivaDocContext = await buildDocumentContext("taniva", "Reid");
const pdfBlock = tanivaDocContext.mediaBlocks.find((b) => b.type === "document");
assert(pdfBlock, "PDF produces document media block");
assert(pdfBlock.source?.type === "base64", "PDF block source.type is base64");
assert(
  pdfBlock.source?.media_type === "application/pdf",
  "PDF block media_type is application/pdf"
);
assert(typeof pdfBlock.source?.data === "string" && pdfBlock.source.data.length > 0, "PDF block has data");

const tanivaPromptSnippet = tanivaDocContext.textBlocks;
assert(
  !tanivaPromptSnippet.includes(pdfPayload.slice(0, 40)),
  "PDF base64 NOT injected as system prompt text"
);
assert(tanivaPromptSnippet.includes("[PDF attached"), "PDF referenced in text note only");

// 3. Image → Hawthorne Legacy Group
section("3. Image upload — Hawthorne Legacy Group");

const pngFile = makePngFile();
const imgDocId = await saveDocument("hawthorne-legacy", pngFile, {
  name: "Carrier Logo",
  type: "image/png",
  description: "Partner logo",
  tags: ["market", "all"],
});

const hawthorneContext = await buildDocumentContext("hawthorne-legacy", "Mason");
const imageBlock = hawthorneContext.mediaBlocks.find((b) => b.type === "image");
assert(imageBlock, "Image produces image media block");
assert(imageBlock.source?.type === "base64", "Image block source.type is base64");
assert(imageBlock.source?.media_type === "image/png", "Image mimeType is image/png");
assert(imageBlock.source?.data?.length > 0, "Image block has base64 data");

// 4. Spreadsheet → Iron City Cargo
section("4. Spreadsheet upload — Iron City Cargo");

const xlsxFile = makeXlsxFile();
const sheetDocId = await saveDocument("iron-city-cargo", xlsxFile, {
  name: "Load Rate History",
  type: xlsxFile.type,
  description: "Historical carrier load rates",
  tags: ["rates", "financial", "all"],
});

const sheetRecord = await getDocument(sheetDocId);
const sheetPayload = sheetRecord.content;
assert(sheetPayload.summary, "Spreadsheet has summary in IndexedDB");
assert(sheetPayload.preview, "Spreadsheet has preview in IndexedDB");
assert(sheetPayload.full?.["Load Rates"], "Spreadsheet full JSON in IndexedDB");
assert(sheetPayload.rowCount === 3, "Spreadsheet rowCount is 3");

const normalized = normalizeSpreadsheetPayload(sheetPayload);
assert(normalized.preview.includes("| Carrier |"), "Preview is markdown table");
assert(normalized.preview.includes("ABC Freight"), "Preview includes row data");

const reidSheetContext = await buildDocumentContext("iron-city-cargo", "Reid");
assert(
  reidSheetContext.textBlocks.includes("Load Rate History"),
  "Reid context names spreadsheet"
);
assert(
  reidSheetContext.textBlocks.includes("| Carrier |") ||
    reidSheetContext.textBlocks.includes("ABC Freight"),
  "Reid context includes preview table (under 50 rows = full or preview)"
);

// 5. PARIS portfolio grouping
section("5. PARIS — all businesses grouped");

const parisBusinesses = Object.values(BUSINESSES).filter((b) => !b.isPortfolio);
const parisContext = await buildPortfolioDocumentContext(parisBusinesses, "Reid");

assert(
  parisContext.textBlocks.includes("## Iron City Cargo documents"),
  "PARIS includes Iron City Cargo section"
);
assert(
  parisContext.textBlocks.includes("## Taniva Health documents"),
  "PARIS includes Taniva section"
);
assert(
  parisContext.textBlocks.includes("## Hawthorne Legacy Group documents"),
  "PARIS includes Hawthorne Legacy Group section"
);
assert(parisContext.textBlocks.includes("ICC Revenue Q1"), "PARIS ICC doc visible to Reid");
assert(parisContext.textBlocks.includes("Benefits Overview"), "PARIS Taniva doc visible to Reid");

// 6. financial tag only — Reid yes, Leo/Mason no
section("6. Tag isolation — financial only");

await saveDocument("taniva", makeFile("cash-only.md", "Invoice and cash flow ledger.", "text/markdown"), {
  name: "Cash Ledger",
  type: "text/markdown",
  description: "Financial only doc",
  tags: ["financial"],
});

const financialMeta = (await listDocuments("taniva")).find((d) => d.name === "Cash Ledger");
assert(financialMeta, "Financial-only doc saved");

assert(isDocumentRelevantToAgent(financialMeta, "Reid"), "financial → Reid");
assert(!isDocumentRelevantToAgent(financialMeta, "Leo"), "financial → NOT Leo");
assert(!isDocumentRelevantToAgent(financialMeta, "Mason"), "financial → NOT Mason");

const reidTaniva = await buildDocumentContext("taniva", "Reid");
const leoTaniva = await buildDocumentContext("taniva", "Leo");
const masonTaniva = await buildDocumentContext("taniva", "Mason");

assert(reidTaniva.textBlocks.includes("Cash Ledger"), "Cash Ledger in Reid context");
assert(!leoTaniva.textBlocks.includes("Cash Ledger"), "Cash Ledger NOT in Leo context");
assert(!masonTaniva.textBlocks.includes("Cash Ledger"), "Cash Ledger NOT in Mason context");

// 7. Delete document
section("7. Delete document");

const deleteTargetId = mdDocId;
await deleteDocument("iron-city-cargo", deleteTargetId);

const iccAfterDelete = await listDocuments("iron-city-cargo");
assert(!iccAfterDelete.some((d) => d.docId === deleteTargetId), "Removed from metadata list");

let idbGone = false;
try {
  await getDocument(deleteTargetId);
} catch {
  idbGone = true;
}
assert(idbGone, "Removed from IndexedDB (getDocument throws)");

const reidAfterDelete = await buildDocumentContext("iron-city-cargo", "Reid");
assert(
  !reidAfterDelete.textBlocks.includes("ICC Revenue Q1"),
  "Deleted doc no longer in Reid context"
);
assert(readMeta("iron-city-cargo").every((d) => d.docId !== deleteTargetId), "Metadata array clean");

// 8. Messages array structure for PDF API call
section("8. API messages array — PDF document block");

const pdfApiContext = await buildDocumentContext("taniva", "Reid");
const conversationHistory = [];
const userMessage = "Please review the benefits overview PDF.";
const userContent = buildUserMessageContent(userMessage, pdfApiContext.mediaBlocks);

const messages = [
  ...conversationHistory,
  { role: "user", content: userContent },
];

console.log("\n--- Full messages array (PDF test) ---");
console.log(
  JSON.stringify(
    messages,
    (key, value) => {
      if (key === "data" && typeof value === "string" && value.length > 80) {
        return `${value.slice(0, 40)}…[${value.length} chars]`;
      }
      return value;
    },
    2
  )
);
console.log("--- end messages array ---\n");

assert(Array.isArray(messages[0].content), "User content is content array");
const docBlock = messages[0].content.find((b) => b.type === "document");
const textBlock = messages[0].content.find((b) => b.type === "text");
assert(docBlock, "Messages include document block");
assert(textBlock, "Messages include text block");
assert(docBlock.type === "document", "Block type is document");
assert(docBlock.source?.type === "base64", "source.type is base64");
assert(docBlock.source?.media_type === "application/pdf", "media_type is application/pdf");
assert(typeof docBlock.source?.data === "string", "data is base64 string");
assert(messages[0].content[0].type === "document", "Document block comes before text");

// Summary
console.log("\n=== Summary ===");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
