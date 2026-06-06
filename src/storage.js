import { migrateDocumentMetadataV2 as runDocumentMetadataMigrationV2 } from "../documents/documentStore.js";
import { getActiveModuleId } from "./modules/index.js";
import {
  MIGRATION_V1_DONE_KEY,
  chatHistoryStorageKey,
  memoryFactsStorageKey,
  migrateStorageKeyPrefix,
} from "./storage-keys.js";

let cloudStorageUserId = null;

async function cloudMemory() {
  return import("./cloudMemoryStore.js");
}

async function cloudChat() {
  return import("./cloudChatStore.js");
}

function isCloudMemoryEnabled() {
  return Boolean(cloudStorageUserId);
}

function isCloudChatsEnabled() {
  return Boolean(cloudStorageUserId);
}

function capitalizeAgent(agent) {
  return agent.charAt(0).toUpperCase() + agent.slice(1);
}

const LEADING_AGENT_PREFIX =
  /^[\s\uFEFF]*(?:(?:\*\*)?\[[^\]]+\](?:\*\*)?\s*[:\-—–]?\s*)+/i;

export function stripAgentNamePrefix(content) {
  if (!content || typeof content !== "string") return content;
  return content.replace(LEADING_AGENT_PREFIX, "").trimStart();
}

/** Storage scope: module id (e.g. council). */
function resolveScopeId(scopeId) {
  return scopeId ?? getActiveModuleId();
}

/** One-time localStorage migrations (legacy keys → pc- prefix). */
export function migrateOldData() {
  if (typeof localStorage === "undefined") return;

  migrateStorageKeyPrefix();

  if (localStorage.getItem(MIGRATION_V1_DONE_KEY)) return;

  const councilChatKey = chatHistoryStorageKey("council");
  const councilMemoryKey = memoryFactsStorageKey("council");
  const legacyMigrations = [
    { from: "chatHistory", to: councilChatKey },
    { from: "memoryFacts", to: councilMemoryKey },
    { from: "pc-chatHistory_council", to: councilChatKey },
    { from: "pc-memoryFacts_council", to: councilMemoryKey },
  ];

  for (const { from, to } of legacyMigrations) {
    const existing = localStorage.getItem(from);
    const alreadyMigrated = localStorage.getItem(to);
    if (existing && !alreadyMigrated) {
      localStorage.setItem(to, existing);
    }
  }

  localStorage.setItem(MIGRATION_V1_DONE_KEY, "true");
}

/** Document metadata migration (docs_meta_* merge + IndexedDB reconnect). */
export async function migrateDocumentMetadataV2() {
  return runDocumentMetadataMigrationV2();
}

export {
  isLegacyMigrationAllowed,
  migrateLegacyDocumentsToSupabase,
  migrateLegacyMemoryToSupabase,
} from "./legacyCloudMigration.js";

/** Enable Supabase cloud sync for durable data (not active UI state). */
export function setCloudStorageUser(userId) {
  cloudStorageUserId = userId ?? null;
  void import("../documents/cloudDocumentStore.js").then((m) =>
    m.setCloudDocumentUser(userId)
  );
  void cloudMemory().then((m) => m.setCloudMemoryUser(userId));
  void cloudChat().then((m) => m.setCloudChatUser(userId));
  void import("./userPreferences.js").then((m) => m.logStorageSources());
}

/** One-time upload of local memoryFacts_* to Supabase (per user). */
export async function syncLocalMemoryToCloud() {
  const m = await cloudMemory();
  m.setCloudMemoryUser(cloudStorageUserId);
  return m.syncLocalMemoryToCloud();
}

/** One-time upload of local chatHistory_* to Supabase (per user). */
export async function syncLocalChatsToCloud() {
  const m = await cloudChat();
  m.setCloudChatUser(cloudStorageUserId);
  return m.syncLocalChatsToCloud();
}

// ---------------------------------------------------------------------------
// Chats (per-business — localStorage)
// ---------------------------------------------------------------------------

export { chatHistoryStorageKey, memoryFactsStorageKey } from "./storage-keys.js";

function emptyChatStore() {
  return { chats: [], messages: {} };
}

function readChatStore(businessId) {
  if (typeof localStorage === "undefined") {
    return emptyChatStore();
  }

  try {
    const raw = localStorage.getItem(chatHistoryStorageKey(businessId));
    if (!raw) {
      return emptyChatStore();
    }

    const parsed = JSON.parse(raw);
    return {
      chats: Array.isArray(parsed.chats) ? parsed.chats : [],
      messages:
        parsed.messages && typeof parsed.messages === "object"
          ? parsed.messages
          : {},
    };
  } catch (error) {
    console.error("Chat history read error:", error);
    return emptyChatStore();
  }
}

function writeChatStore(businessId, store) {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(chatHistoryStorageKey(businessId), JSON.stringify(store));
}

/** Refresh local chat cache from Supabase when signed in. */
async function ensureChatStore(scopeId) {
  if (!isCloudChatsEnabled()) {
    return readChatStore(scopeId);
  }

  try {
    const m = await cloudChat();
    const store = await m.cloudLoadChatStore(scopeId);
    writeChatStore(scopeId, store);
    return store;
  } catch (err) {
    console.warn("[chats] Cloud load failed, using local cache:", err);
    return readChatStore(scopeId);
  }
}

function sortChatsNewestFirst(chats) {
  return [...chats].sort(
    (a, b) => new Date(b.updated_at) - new Date(a.updated_at)
  );
}

function bumpChatUpdatedAt(store, chatId, timestamp) {
  const chat = store.chats.find((row) => row.id === chatId);
  if (!chat) return;

  chat.updated_at = timestamp;
  store.chats = sortChatsNewestFirst(store.chats);
}

export async function createChat(userId, title, scopeId, moduleMeta = {}) {
  const storeId = resolveScopeId(scopeId);
  const store = readChatStore(storeId);
  const now = new Date().toISOString();
  const chat = {
    id: crypto.randomUUID(),
    user_id: userId,
    title,
    created_at: now,
    updated_at: now,
    moduleId: moduleMeta.moduleId ?? storeId,
    moduleType: moduleMeta.moduleType ?? null,
    moduleName: moduleMeta.moduleName ?? null,
    ...(moduleMeta.businessId != null ? { businessId: moduleMeta.businessId } : {}),
  };

  store.chats.unshift(chat);
  store.messages[chat.id] = [];
  writeChatStore(storeId, store);

  if (isCloudChatsEnabled()) {
    try {
      const m = await cloudChat();
      await m.cloudUpsertChat(storeId, chat);
      console.log("[chats] Saved to cloud", { scopeId: storeId, chatId: chat.id });
    } catch (err) {
      console.error("[chats] Cloud save failed (local copy kept):", err);
    }
  }

  return chat;
}

export async function getChats(userId, businessId) {
  void userId;
  const scopeId = resolveScopeId(businessId);
  const store = await ensureChatStore(scopeId);
  return sortChatsNewestFirst(store.chats);
}

export async function updateChatTitle(chatId, title, businessId) {
  const bizId = resolveScopeId(businessId);
  const store = await ensureChatStore(bizId);
  const chat = store.chats.find((row) => row.id === chatId);

  if (!chat) {
    throw new Error(`Chat not found: ${chatId}`);
  }

  chat.title = title;
  chat.updated_at = new Date().toISOString();
  store.chats = sortChatsNewestFirst(store.chats);
  writeChatStore(bizId, store);

  if (isCloudChatsEnabled()) {
    try {
      const m = await cloudChat();
      await m.cloudUpsertChat(bizId, chat);
    } catch (err) {
      console.error("[chats] Cloud title update failed:", err);
    }
  }

  return chat;
}

export async function deleteChat(chatId, businessId) {
  const bizId = resolveScopeId(businessId);
  const store = readChatStore(bizId);
  store.chats = store.chats.filter((row) => row.id !== chatId);
  delete store.messages[chatId];
  writeChatStore(bizId, store);

  if (isCloudChatsEnabled()) {
    try {
      const m = await cloudChat();
      await m.cloudDeleteChat(chatId);
    } catch (err) {
      console.warn("[chats] Cloud delete failed:", err);
    }
  }
}

export async function getChat(chatId, businessId) {
  const store = await ensureChatStore(resolveScopeId(businessId));
  return store.chats.find((row) => row.id === chatId) ?? null;
}

function formatExportTimestamp(dateStr) {
  return new Date(dateStr).toLocaleString([], {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function exportChat(chatId, businessId) {
  const chat = await getChat(chatId, businessId);
  if (!chat) {
    throw new Error(`Chat not found: ${chatId}`);
  }

  const messages = await getMessages(chatId, businessId);

  const lines = [
    chat.title || "Untitled chat",
    formatExportTimestamp(chat.created_at),
    "",
  ];

  for (const message of messages) {
    const timestamp = formatExportTimestamp(message.created_at);

    if (message.role === "user") {
      lines.push(`[You] (${timestamp})`);
      lines.push(message.content);
    } else if (message.agent) {
      lines.push(`[${capitalizeAgent(message.agent)}] (${timestamp})`);
      lines.push(stripAgentNamePrefix(message.content));
    }

    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export async function getMessages(chatId, businessId) {
  const store = await ensureChatStore(resolveScopeId(businessId));
  return store.messages[chatId] ?? [];
}

export async function saveMessage(
  chatId,
  userId,
  role,
  content,
  agent = null,
  attachments = null,
  businessId,
  options = {}
) {
  const bizId = resolveScopeId(businessId);
  const store = readChatStore(bizId);
  const cleanContent =
    role === "assistant" ? stripAgentNamePrefix(content) : content;
  const now = new Date().toISOString();
  const { flaggedBy } = options;

  const message = {
    id: crypto.randomUUID(),
    chat_id: chatId,
    user_id: userId,
    role,
    content: cleanContent,
    ...(role === "assistant" && agent ? { agent } : {}),
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
    ...(flaggedBy ? { flagged_by: flaggedBy } : {}),
    created_at: now,
  };

  if (!store.messages[chatId]) {
    store.messages[chatId] = [];
  }

  store.messages[chatId].push(message);
  bumpChatUpdatedAt(store, chatId, now);
  writeChatStore(bizId, store);

  if (isCloudChatsEnabled()) {
    try {
      const m = await cloudChat();
      await m.cloudInsertMessage(message);
      await m.cloudTouchChat(chatId, now);
    } catch (err) {
      console.error("[chats] Cloud message save failed (local copy kept):", err);
    }
  }

  return message;
}

function formatMessageForContext(message) {
  let content =
    message.role === "assistant"
      ? stripAgentNamePrefix(message.content)
      : message.content;

  if (message.attachments?.length) {
    const names = message.attachments.map((item) => item.name).join(", ");
    content = `${content}\n[Attached files: ${names}]`;
  }

  return {
    role: message.role,
    content,
  };
}

export async function getMessagesForContext(chatId, businessId) {
  const messages = await getMessages(chatId, businessId);
  return messages.map(formatMessageForContext);
}

// ---------------------------------------------------------------------------
// Memory (per-business knowledge base — localStorage)
// ---------------------------------------------------------------------------

function readMemoryStore(businessId) {
  if (typeof localStorage === "undefined") {
    return [];
  }

  try {
    const raw = localStorage.getItem(memoryFactsStorageKey(businessId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Memory read error:", error);
    return [];
  }
}

function writeMemoryStore(businessId, rows) {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(memoryFactsStorageKey(businessId), JSON.stringify(rows));
}

export async function getMemory(userId, businessId) {
  void userId;
  const scopeId = resolveScopeId(businessId);

  if (isCloudMemoryEnabled()) {
    try {
      const m = await cloudMemory();
      const rows = await m.cloudListMemory(scopeId);
      writeMemoryStore(scopeId, rows);
      return rows;
    } catch (err) {
      console.warn("[memory] Cloud list failed, using local cache:", err);
    }
  }

  return readMemoryStore(scopeId);
}

async function loadMemoryForScope(scopeId) {
  if (isCloudMemoryEnabled()) {
    try {
      const m = await cloudMemory();
      const rows = await m.cloudListMemory(scopeId);
      writeMemoryStore(scopeId, rows);
      return rows;
    } catch (err) {
      console.warn(`[memory] Cloud list failed for ${scopeId}:`, err);
    }
  }
  return readMemoryStore(scopeId);
}

/** Memory for agent prompts — shared knowledge base for the active scope. */
export async function getAgentMemory(userId, biz) {
  void userId;
  const scopeId =
    typeof biz === "string" ? biz : (biz?.id ?? resolveScopeId());
  return { portfolio: false, facts: await loadMemoryForScope(scopeId) };
}

export async function addMemoryFact(
  userId,
  fact,
  category = null,
  businessId
) {
  const bizId = resolveScopeId(businessId);
  const rows = readMemoryStore(bizId);
  const row = {
    id: crypto.randomUUID(),
    user_id: userId,
    agent: "shared",
    fact,
    category,
    created_at: new Date().toISOString(),
  };

  rows.push(row);
  writeMemoryStore(bizId, rows);

  if (isCloudMemoryEnabled()) {
    try {
      const m = await cloudMemory();
      await m.cloudInsertMemoryFact(bizId, row);
      console.log("[memory] Saved to cloud", { scopeId: bizId, factId: row.id });
    } catch (err) {
      console.error("[memory] Cloud save failed (local copy kept):", err);
    }
  }

  return row;
}

export async function deleteMemoryFact(factId, businessId) {
  const bizId = resolveScopeId(businessId);

  if (isCloudMemoryEnabled()) {
    try {
      const m = await cloudMemory();
      await m.cloudDeleteMemoryFact(bizId, factId);
    } catch (err) {
      console.warn("[memory] Cloud delete failed:", err);
    }
  }

  const rows = readMemoryStore(bizId).filter((row) => row.id !== factId);
  writeMemoryStore(bizId, rows);
}

export async function replaceAllMemory(userId, factsArray, businessId) {
  const bizId = resolveScopeId(businessId);

  if (!factsArray?.length) {
    writeMemoryStore(bizId, []);
    if (isCloudMemoryEnabled()) {
      try {
        const m = await cloudMemory();
        await m.cloudReplaceAllMemory(bizId, []);
      } catch (err) {
        console.warn("[memory] Cloud clear failed:", err);
      }
    }
    return [];
  }

  const rows = factsArray.map((fact) => ({
    id: crypto.randomUUID(),
    user_id: userId,
    agent: "shared",
    fact: typeof fact === "string" ? fact : fact.fact,
    category: null,
    created_at: new Date().toISOString(),
  }));

  writeMemoryStore(bizId, rows);

  if (isCloudMemoryEnabled()) {
    try {
      const m = await cloudMemory();
      await m.cloudReplaceAllMemory(bizId, rows);
    } catch (err) {
      console.error("[memory] Cloud replace failed (local copy kept):", err);
    }
  }

  return rows;
}
