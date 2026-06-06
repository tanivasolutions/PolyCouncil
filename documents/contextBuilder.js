import {
  docMetaStorageKey,
  getDocument,
  listDocuments,
} from "./documentStore.js";
import { getActiveModule, getActiveModuleId } from "../src/modules/index.js";
import {
  isSpreadsheetStorageKind,
  normalizeSpreadsheetPayload,
  resolveSpreadsheetInjectionTier,
  sheetsToFullMarkdown,
} from "./spreadsheet.js";

const BUSINESS_AGENT_TAG_KEYWORDS = {
  reid: [
    "financial",
    "revenue",
    "expenses",
    "carriers",
    "rates",
    "pricing",
    "budget",
    "cash",
  ],
  leo: [
    "operations",
    "compliance",
    "drivers",
    "fleet",
    "maintenance",
    "process",
    "carriers",
    "schedule",
  ],
  mason: [
    "market",
    "strategy",
    "growth",
    "competitors",
    "partnerships",
    "opportunities",
    "carriers",
    "pipeline",
  ],
};

const SPREADSHEET_FOLLOWUP_PATTERN =
  /\b(sheet|spreadsheet|rows?|columns?|cells?|tabs?|full data|all rows|the data|rate sheet|carrier rates?|load rates?|break\s?down|analyze|specific sheet|show me|pull up|drill down|what about|how many|which carrier)\b/i;

function normalizeAgentName(agentName) {
  return String(agentName ?? "").trim().toLowerCase();
}

function normalizeTags(tags) {
  return (Array.isArray(tags) ? tags : []).map((tag) =>
    String(tag).trim().toLowerCase()
  );
}

function getAgentTagKeywords() {
  const mod = getActiveModule();
  if (mod?.agentTagKeywords) return mod.agentTagKeywords;
  return BUSINESS_AGENT_TAG_KEYWORDS;
}

export function isDocumentRelevantToAgent(metadata, agentName) {
  const tags = normalizeTags(metadata?.tags);
  if (tags.includes("all")) return true;

  const keywordMap = getAgentTagKeywords();
  const keywords = keywordMap[normalizeAgentName(agentName)] ?? [];
  if (!keywords.length) return false;

  return tags.some((tag) => keywords.some((keyword) => tag.includes(keyword)));
}

export function getVisibleAgentsForDocument(metadata) {
  const mod = getActiveModule();
  const agentMap = mod?.agentGroup ?? null;

  if (agentMap) {
    return Object.entries(agentMap)
      .filter(([key]) => isDocumentRelevantToAgent(metadata, key))
      .map(([, agent]) => agent.name);
  }

  const agents = [];
  if (isDocumentRelevantToAgent(metadata, "reid")) agents.push("Reid");
  if (isDocumentRelevantToAgent(metadata, "leo")) agents.push("Leo");
  if (isDocumentRelevantToAgent(metadata, "mason")) agents.push("Mason");
  return agents;
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl ?? "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return { mediaType: "image/png", data: "" };
  return { mediaType: match[1], data: match[2] };
}

function docHeader(metadata, businessLabel = null) {
  const parts = [];
  if (businessLabel) {
    parts.push(`#### ${businessLabel} — ${metadata.name}`);
  } else {
    parts.push(`### ${metadata.name}`);
  }
  if (metadata.description?.trim()) parts.push(metadata.description.trim());
  if (metadata.tags?.length) parts.push(`Tags: ${metadata.tags.join(", ")}`);
  const rowCount = metadata.rowCount;
  if (rowCount != null && isSpreadsheetStorageKind(metadata.storageKind)) {
    parts.push(`Rows: ${rowCount}`);
  }
  return parts.join("\n");
}

function formatMarkdownBlock(metadata, content, businessLabel) {
  const text = typeof content === "string" ? content : String(content ?? "");
  return `${docHeader(metadata, businessLabel)}\n\n${text}`;
}

function formatSpreadsheetBlock(metadata, content, businessLabel, agentName) {
  const normalized = normalizeSpreadsheetPayload(content);
  const tier = resolveSpreadsheetInjectionTier(
    normalized.rowCount,
    metadata,
    agentName
  );

  let body = "";
  let note = "";

  switch (tier) {
    case "full":
      body = sheetsToFullMarkdown(normalized.full);
      break;
    case "preview":
      body = normalized.preview || "(empty spreadsheet)";
      if (normalized.rowCount >= 50) {
        note = `Full spreadsheet data (${normalized.rowCount} rows total) is available on request (document id: ${metadata.docId}).`;
      }
      break;
    case "summary":
    default:
      body = normalized.summary || "(empty spreadsheet)";
      note = `This spreadsheet has ${normalized.rowCount} rows across all sheets. Ask me to analyze a specific sheet or data range, or request full data (document id: ${metadata.docId}).`;
      break;
  }

  const lines = [docHeader(metadata, businessLabel), "", body];
  if (note) lines.push("", note);
  return lines.join("\n");
}

function formatPdfBlock(metadata, content) {
  const base64 =
    typeof content === "string" ? content : parseDataUrl(content).data;
  return {
    type: "document",
    source: { type: "base64", media_type: "application/pdf", data: base64 },
  };
}

function formatImageBlock(metadata, content) {
  const { mediaType, data } =
    typeof content === "string" && content.startsWith("data:")
      ? parseDataUrl(content)
      : {
          mediaType: metadata.mimeType || metadata.type || "image/png",
          data: typeof content === "string" ? content : "",
        };
  return {
    type: "image",
    source: { type: "base64", media_type: mediaType, data },
  };
}

function getHistoryText(message) {
  if (typeof message?.content === "string") return message.content;
  if (Array.isArray(message?.content)) {
    return message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
  }
  return "";
}

function findReferencedSpreadsheetDocs(userText, spreadsheets, conversationHistory) {
  const mentioned = new Set();
  const lowerText = userText.toLowerCase();
  const recentAssistant = (conversationHistory ?? [])
    .filter((m) => m.role === "assistant")
    .slice(-4);

  for (const doc of spreadsheets) {
    const nameLower = String(doc.name ?? "").toLowerCase();
    if (nameLower && lowerText.includes(nameLower)) mentioned.add(doc.docId);
    if (lowerText.includes(doc.docId)) mentioned.add(doc.docId);
    for (const message of recentAssistant) {
      const assistantText = getHistoryText(message);
      if (
        assistantText.includes(doc.docId) ||
        (nameLower && assistantText.toLowerCase().includes(nameLower))
      ) {
        mentioned.add(doc.docId);
      }
    }
  }

  if (
    !mentioned.size &&
    spreadsheets.length === 1 &&
    SPREADSHEET_FOLLOWUP_PATTERN.test(userText)
  ) {
    mentioned.add(spreadsheets[0].docId);
  }

  return [...mentioned];
}

export async function buildSpreadsheetFollowUpContext(
  moduleId,
  agentName,
  userMessage,
  conversationHistory = []
) {
  const userText =
    typeof userMessage === "string"
      ? userMessage
      : getHistoryText({ content: userMessage });

  if (!userText?.trim() || !SPREADSHEET_FOLLOWUP_PATTERN.test(userText)) {
    return { textBlocks: "", mediaBlocks: [] };
  }

  const allDocs = await listDocuments(moduleId);
  const spreadsheets = allDocs.filter(
    (doc) =>
      isSpreadsheetStorageKind(doc.storageKind) &&
      isDocumentRelevantToAgent(doc, agentName)
  );

  if (!spreadsheets.length) return { textBlocks: "", mediaBlocks: [] };

  const docIds = findReferencedSpreadsheetDocs(
    userText,
    spreadsheets,
    conversationHistory
  );
  if (!docIds.length) return { textBlocks: "", mediaBlocks: [] };

  const textParts = ["## Spreadsheet data (included for this message only)\n"];

  for (const docId of docIds) {
    const metadata = spreadsheets.find((doc) => doc.docId === docId);
    if (!metadata) continue;
    try {
      const { content } = await getDocument(docId);
      const normalized = normalizeSpreadsheetPayload(content);
      const fullTable = sheetsToFullMarkdown(normalized.full);
      textParts.push(
        `### ${metadata.name}\n\n${fullTable}\n\n(Full spreadsheet — ${normalized.rowCount} rows — document id: ${metadata.docId})`
      );
    } catch (error) {
      console.error(`Spreadsheet follow-up failed for ${docId}:`, error);
    }
  }

  if (textParts.length <= 1) return { textBlocks: "", mediaBlocks: [] };
  return { textBlocks: textParts.join("\n\n"), mediaBlocks: [] };
}

async function formatDocumentForContext(metadata, businessLabel, agentName) {
  const { content } = await getDocument(metadata.docId);
  const kind = metadata.storageKind ?? "markdown";

  switch (kind) {
    case "markdown":
    case "document":
      return { text: formatMarkdownBlock(metadata, content, businessLabel), media: null };
    case "pdf":
      return {
        text: `${docHeader(metadata, businessLabel)}\n\n[PDF attached: ${metadata.name}]`,
        media: formatPdfBlock(metadata, content),
      };
    case "image":
      return {
        text: `${docHeader(metadata, businessLabel)}\n\n[Image attached: ${metadata.name}]`,
        media: formatImageBlock(metadata, content),
      };
    case "csv":
    case "xlsx":
    case "spreadsheet":
      return {
        text: formatSpreadsheetBlock(metadata, content, businessLabel, agentName),
        media: null,
      };
    default:
      return { text: formatMarkdownBlock(metadata, content, businessLabel), media: null };
  }
}

function logDocumentContextResult(scopeModuleId, agentName, allDocs, relevant, result) {
  const textBlocksPopulated = Boolean(result?.textBlocks?.trim());
  console.log("[documents] buildDocumentContext", {
    activeModuleId: getActiveModuleId(),
    scopeModuleId: scopeModuleId,
    metadataKey: docMetaStorageKey(scopeModuleId),
    agentName,
    docCount: allDocs.length,
    relevantCount: relevant.length,
    textBlocksPopulated,
    textBlocksLength: result?.textBlocks?.length ?? 0,
    mediaBlockCount: result?.mediaBlocks?.length ?? 0,
  });
}

export async function buildDocumentContext(moduleId, agentName, options = {}) {
  const { userMessage = "", conversationHistory = [] } = options;
  const allDocs = await listDocuments(moduleId);
  const relevant = allDocs.filter((doc) => isDocumentRelevantToAgent(doc, agentName));

  const textParts = relevant.length ? ["## Uploaded documents\n"] : [];
  const mediaBlocks = [];

  for (const metadata of relevant) {
    try {
      const { text, media } = await formatDocumentForContext(
        metadata,
        null,
        agentName
      );
      if (text?.trim()) textParts.push(text);
      if (media) mediaBlocks.push(media);
    } catch (error) {
      console.error(`Document context failed for ${metadata.docId}:`, error);
      textParts.push(`${docHeader(metadata)}\n\n(Could not load document content.)`);
    }
  }

  const base = {
    textBlocks: textParts.length > 1 ? textParts.join("\n\n") : "",
    mediaBlocks,
  };

  const followUp = await buildSpreadsheetFollowUpContext(
    moduleId,
    agentName,
    userMessage,
    conversationHistory
  );

  const merged = !followUp.textBlocks?.trim()
    ? base
    : {
        textBlocks: [base.textBlocks, followUp.textBlocks].filter(Boolean).join("\n\n"),
        mediaBlocks: [...base.mediaBlocks, ...followUp.mediaBlocks],
      };

  logDocumentContextResult(moduleId, agentName, allDocs, relevant, merged);
  return merged;
}

export async function buildPortfolioDocumentContext(
  businesses,
  agentName,
  options = {}
) {
  const businessList = Array.isArray(businesses) ? businesses : [];
  const textParts = [];
  const mediaBlocks = [];

  for (const business of businessList) {
    const businessId = business.id ?? business.businessId;
    if (!businessId) continue;
    const label = business.displayName ?? business.name ?? businessId;
    const { textBlocks, mediaBlocks: businessMedia } = await buildDocumentContext(
      businessId,
      agentName,
      options
    );
    if (textBlocks?.trim()) textParts.push(`## ${label} documents\n\n${textBlocks}`);
    if (businessMedia?.length) mediaBlocks.push(...businessMedia);
  }

  return { textBlocks: textParts.join("\n\n"), mediaBlocks };
}
