import { processDocx } from "./processors.js";
import { buildSpreadsheetRepresentations } from "./spreadsheet.js";

import {
  MIGRATION_DOCS_V2_DONE_KEY,
  docMetaStorageKey,
} from "../src/storage-keys.js";

const DB_NAME = "pc_documents";
const LEGACY_DB_NAME = "icc_documents";
const DB_VERSION = 1;
const STORE_NAME = "files";

const SUPPORTED_EXTENSIONS = new Set([
  ".md",
  ".pdf",
  ".doc",
  ".docx",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".xlsx",
  ".csv",
]);

let dbPromise = null;
let cloudDocumentUserId = null;

async function cloudDocs() {
  return import("./cloudDocumentStore.js");
}

function isCloudDocumentsEnabled() {
  return Boolean(cloudDocumentUserId);
}

export { docMetaStorageKey };

const DOC_META_MIGRATION_PAIRS = [{ from: "docs_meta", to: docMetaStorageKey("council") }];

const DOC_META_RECONNECT_SCOPES = ["council"];

function metaStorageKey(businessId) {
  return docMetaStorageKey(businessId);
}

function getExtension(filename) {
  const match = String(filename ?? "").match(/(\.[^.]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

function assertSupportedFile(file, metadata = {}) {
  const name = metadata.name ?? file?.name ?? "";
  let ext = getExtension(name);
  if (!SUPPORTED_EXTENSIONS.has(ext) && file?.name) {
    ext = getExtension(file.name);
  }
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new Error(
      "Unsupported file type. Supported: .md, .pdf, .doc, .docx, .png, .jpg, .webp, .xlsx, .csv"
    );
  }
  return ext;
}

export function readDocumentMetadataList(businessId) {
  if (typeof localStorage === "undefined") {
    return [];
  }

  try {
    const raw = localStorage.getItem(metaStorageKey(businessId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Document metadata read error:", error);
    return [];
  }
}

function writeMetadataList(businessId, rows) {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(metaStorageKey(businessId), JSON.stringify(rows));
}

function parseMetadataArray(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Merge source rows into target key by docId without overwriting existing entries. */
function mergeMetadataStorageKey(targetKey, sourceRows, options = {}) {
  if (typeof localStorage === "undefined" || !sourceRows?.length) {
    return 0;
  }

  const existing = parseMetadataArray(localStorage.getItem(targetKey));
  const byDocId = new Map(existing.map((row) => [row.docId, row]));
  let added = 0;

  for (const row of sourceRows) {
    if (!row?.docId || byDocId.has(row.docId)) continue;
    byDocId.set(row.docId, row);
    added += 1;
  }

  if (!added) return 0;

  localStorage.setItem(
    targetKey,
    JSON.stringify([...byDocId.values()].sort(
      (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
    ))
  );

  if (options.log) {
    console.log(
      `[documents] Merged ${added} metadata row(s) into ${targetKey}`
    );
  }

  return added;
}

function mergeMetadataScope(targetScopeId, sourceRows) {
  return mergeMetadataStorageKey(metaStorageKey(targetScopeId), sourceRows, {
    log: true,
  });
}

export function parseBusinessIdFromDocId(docId) {
  const match = String(docId ?? "").match(/^doc_(.+)_(\d{10,})$/);
  return match?.[1] ?? null;
}

/** Enable Supabase cloud storage for documents (memory: use setCloudStorageUser from storage.js). */
export function setDocumentCloudUser(userId) {
  cloudDocumentUserId = userId ?? null;
  void cloudDocs().then((m) => m.setCloudDocumentUser(userId));
}

/** One-time upload of local IndexedDB documents to Supabase (per user). */
export async function syncLocalDocumentsToCloud() {
  const m = await cloudDocs();
  m.setCloudDocumentUser(cloudDocumentUserId);
  return m.syncLocalDocumentsToCloud({
    listAllFileRecords,
    readDocumentMetadataList,
    parseBusinessIdFromDocId,
  });
}

function metadataFromFileRecord(record) {
  const businessId =
    record.businessId ?? parseBusinessIdFromDocId(record.docId);
  if (!businessId || !record.docId) return null;

  const name =
    record.name ??
    String(record.docId).replace(/^doc_[^_]+_/, "document");

  return {
    docId: record.docId,
    businessId,
    name,
    type: record.mimeType ?? "",
    description: record.description ?? "",
    tags: Array.isArray(record.tags) ? record.tags : [],
    storageKind: record.storageKind ?? "markdown",
    size: record.size ?? null,
    mimeType: record.mimeType ?? "",
    rowCount: record.payload?.rowCount ?? null,
    createdAt: record.createdAt ?? record.updatedAt ?? new Date().toISOString(),
    updatedAt: record.updatedAt ?? new Date().toISOString(),
  };
}

export async function listAllFileRecords() {
  const db = await getDb();
  if (!db) return [];

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB list failed"));
  });
}

/**
 * Restore missing docs_meta_* rows from IndexedDB file records (files are keyed by docId).
 */
export async function reconnectIndexedDBDocumentMetadata() {
  const records = await listAllFileRecords();
  const byScope = new Map();

  for (const record of records) {
    const meta = metadataFromFileRecord(record);
    if (!meta) continue;
    if (!byScope.has(meta.businessId)) {
      byScope.set(meta.businessId, []);
    }
    byScope.get(meta.businessId).push(meta);
  }

  let totalAdded = 0;

  for (const scopeId of DOC_META_RECONNECT_SCOPES) {
    const recovered = byScope.get(scopeId) ?? [];
    if (!recovered.length) continue;
    totalAdded += mergeMetadataScope(scopeId, recovered);
  }

  // Also reconnect any scope present in IndexedDB but not in the preset list
  for (const [scopeId, rows] of byScope) {
    if (DOC_META_RECONNECT_SCOPES.includes(scopeId)) continue;
    totalAdded += mergeMetadataScope(scopeId, rows);
  }

  if (totalAdded) {
    console.log(
      `[documents] Reconnected ${totalAdded} metadata row(s) from IndexedDB`
    );
  }

  return { records: records.length, metadataAdded: totalAdded };
}

/**
 * One-time document metadata migration (independent of migration_v1_done).
 * Merges legacy docs_meta_* keys and reconciles IndexedDB → localStorage.
 */
export async function migrateDocumentMetadataV2() {
  if (typeof localStorage === "undefined") {
    return { skipped: true, reason: "no localStorage" };
  }

  if (localStorage.getItem(MIGRATION_DOCS_V2_DONE_KEY)) {
    return { skipped: true, reason: "already done" };
  }

  let pairwiseAdded = 0;

  for (const { from, to } of DOC_META_MIGRATION_PAIRS) {
    const source = parseMetadataArray(localStorage.getItem(from));
    if (!source.length) continue;
    pairwiseAdded += mergeMetadataStorageKey(to, source, { log: true });
  }

  const reconnect = await reconnectIndexedDBDocumentMetadata();

  localStorage.setItem(MIGRATION_DOCS_V2_DONE_KEY, "true");
  console.log("[documents] migration_docs_v2_done", {
    pairwiseAdded,
    reconnect,
  });

  return { pairwiseAdded, reconnect };
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function storageKindForExtension(ext, mimeType = "") {
  if (ext === ".md") return "markdown";
  if (ext === ".doc" || ext === ".docx") return "document";
  if (ext === ".csv" || ext === ".xlsx") return "spreadsheet";
  if (ext === ".pdf") return "pdf";
  if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext) || mimeType.startsWith("image/")) {
    return "image";
  }
  return "binary";
}

async function prepareStoredRecord(file, metadata, docId, businessId) {
  const ext = assertSupportedFile(file, metadata);
  const mimeType = metadata.type ?? file.type ?? "";
  const storageKind = storageKindForExtension(ext, mimeType);

  let payload;

  switch (storageKind) {
    case "markdown": {
      payload = await readFileAsText(file);
      break;
    }
    case "document": {
      const processed = await processDocx(file);
      payload = processed.content;
      break;
    }
    case "spreadsheet": {
      const spreadsheet = await buildSpreadsheetRepresentations(file);
      payload = {
        summary: spreadsheet.summary,
        preview: spreadsheet.preview,
        full: spreadsheet.full,
        rowCount: spreadsheet.rowCount,
      };
      break;
    }
    case "pdf": {
      const buffer = await readFileAsArrayBuffer(file);
      payload = arrayBufferToBase64(buffer);
      break;
    }
    case "image": {
      payload = await readFileAsDataURL(file);
      break;
    }
    default:
      throw new Error(`Unsupported storage kind: ${storageKind}`);
  }

  return {
    docId,
    businessId,
    storageKind,
    mimeType,
    size: file.size,
    payload,
    updatedAt: new Date().toISOString(),
  };
}

async function getDb() {
  if (!dbPromise) {
    await initDocumentDB();
  }
  return dbPromise;
}

async function putFileRecord(record) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(record, record.docId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("IndexedDB write failed"));
  });
}

export async function getFileRecordByDocId(docId) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(docId);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
  });
}

async function deleteFileRecord(docId) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(docId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("IndexedDB delete failed"));
  });
}

export function initDocumentDB() {
  if (typeof indexedDB === "undefined") {
    dbPromise = Promise.resolve(null);
    return dbPromise;
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(request.error ?? new Error("Failed to open document database"));
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };
    });
  }

  return dbPromise;
}

export async function saveDocument(businessId, file, metadata = {}) {
  if (!businessId) {
    throw new Error("businessId is required");
  }
  if (!file) {
    throw new Error("file is required");
  }

  const docId = `doc_${businessId}_${Date.now()}`;
  const name = metadata.name ?? file.name ?? "document";
  const description = metadata.description ?? "";
  const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
  const type = metadata.type ?? file.type ?? getExtension(name);

  const stored = await prepareStoredRecord(
    file,
    { ...metadata, name, type },
    docId,
    businessId
  );

  await putFileRecord(stored);

  const meta = {
    docId,
    businessId,
    name,
    type,
    description,
    tags,
    storageKind: stored.storageKind,
    size: stored.size,
    mimeType: stored.mimeType,
    rowCount: stored.payload?.rowCount ?? null,
    createdAt: stored.updatedAt,
    updatedAt: stored.updatedAt,
  };

  const list = readDocumentMetadataList(businessId);
  list.push(meta);
  writeMetadataList(businessId, list);

  if (isCloudDocumentsEnabled()) {
    try {
      const cloud = await cloudDocs();
      await cloud.cloudSaveDocument(businessId, stored, meta);
    } catch (err) {
      console.error("[documents] Cloud save failed (local copy kept):", err);
    }
  }

  return docId;
}

export async function getDocument(docId, scopeHint = null) {
  if (isCloudDocumentsEnabled()) {
    try {
      const cloud = await cloudDocs();
      const cloudDoc = await cloud.cloudGetDocument(docId, scopeHint);
      await putFileRecord({
        docId,
        businessId: cloudDoc.metadata.businessId,
        storageKind: cloudDoc.metadata.storageKind,
        mimeType: cloudDoc.metadata.mimeType,
        size: cloudDoc.metadata.size,
        payload: cloudDoc.content,
        updatedAt: cloudDoc.metadata.updatedAt,
      });
      return cloudDoc;
    } catch (cloudErr) {
      console.warn("[documents] Cloud get failed, trying local:", cloudErr.message);
    }
  }

  const record = await getFileRecordByDocId(docId);
  if (!record) {
    throw new Error(`Document not found: ${docId}`);
  }

  const businessId = record.businessId ?? parseBusinessIdFromDocId(docId);
  const list = businessId ? readDocumentMetadataList(businessId) : [];
  const metadata =
    list.find((row) => row.docId === docId) ??
    {
      docId,
      businessId,
      name: "Unknown",
      type: record.mimeType ?? "",
      description: "",
      tags: [],
      storageKind: record.storageKind,
      size: record.size,
      rowCount: record.payload?.rowCount ?? null,
      createdAt: record.updatedAt,
      updatedAt: record.updatedAt,
    };

  if (metadata.rowCount == null && record.payload?.rowCount != null) {
    metadata.rowCount = record.payload.rowCount;
  }

  return {
    content: record.payload,
    metadata,
  };
}

export async function listDocuments(businessId) {
  if (isCloudDocumentsEnabled()) {
    try {
      const cloud = await cloudDocs();
      const cloudRows = await cloud.cloudListDocuments(businessId);
      if (cloudRows.length) {
        writeMetadataList(businessId, cloudRows);
      }
      return cloudRows;
    } catch (err) {
      console.warn("[documents] Cloud list failed, using local cache:", err);
    }
  }

  return readDocumentMetadataList(businessId).sort(
    (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
  );
}

export async function deleteDocument(businessId, docId) {
  if (isCloudDocumentsEnabled()) {
    try {
      const cloud = await cloudDocs();
      await cloud.cloudDeleteDocument(businessId, docId);
    } catch (err) {
      console.warn("[documents] Cloud delete failed:", err);
    }
  }

  await deleteFileRecord(docId);

  const list = readDocumentMetadataList(businessId).filter((row) => row.docId !== docId);
  writeMetadataList(businessId, list);
}

export async function getDocumentContent(docId, part = null) {
  const { content, metadata } = await getDocument(docId);
  const kind = metadata.storageKind ?? storageKindForExtension(getExtension(metadata.name), metadata.type ?? "");

  switch (kind) {
    case "markdown":
    case "document":
      return typeof content === "string" ? content : String(content ?? "");
    case "csv":
    case "xlsx":
    case "spreadsheet": {
      if (isLegacySpreadsheetContent(content)) {
        return content;
      }
      if (part === "summary") {
        return content.summary ?? "";
      }
      if (part === "preview") {
        return content.preview ?? "";
      }
      if (part === "full") {
        return content.full ?? content;
      }
      return content;
    }
    case "pdf":
      return typeof content === "string" ? content : arrayBufferToBase64(content);
    case "image":
      return typeof content === "string" ? content : "";
    default:
      return content;
  }
}

function isLegacySpreadsheetContent(content) {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return false;
  }
  return !("full" in content || "summary" in content);
}
