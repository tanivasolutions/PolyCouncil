/**
 * PolyCouncil localStorage / sessionStorage key helpers.
 * All durable UI keys use the pc- prefix.
 */

export const ACTIVE_MODULE_KEY = "pc-activeModule";
export const SIDEBAR_COLLAPSED_KEY = "pc-sidebar-collapsed";
export const CURRENT_CHAT_KEY_PREFIX = "pc-current-chat-id";
export const MIGRATION_V1_DONE_KEY = "pc-migration-v1-done";
export const MIGRATION_PC_PREFIX_DONE_KEY = "pc-migration-prefix-done";
export const MIGRATION_DOCS_V2_DONE_KEY = "pc-migration-docs-v2-done";

export const DEFAULT_MODULE_ID = "council";

export function chatHistoryStorageKey(scopeId) {
  return `pc-chatHistory_${scopeId}`;
}

export function memoryFactsStorageKey(scopeId) {
  return `pc-memoryFacts_${scopeId}`;
}

export function docMetaStorageKey(scopeId) {
  return `pc-docs_meta_${scopeId}`;
}

export function currentChatStorageKey(scopeId) {
  return `${CURRENT_CHAT_KEY_PREFIX}-${scopeId}`;
}

/** One-time copy from legacy localStorage keys into pc- prefixed keys. */
export function migrateStorageKeyPrefix() {
  if (typeof localStorage === "undefined") return;
  if (localStorage.getItem(MIGRATION_PC_PREFIX_DONE_KEY)) return;

  const directKeys = [
    ["icc-sidebar-collapsed", SIDEBAR_COLLAPSED_KEY],
    ["activeModule", ACTIVE_MODULE_KEY],
    ["activeBusiness", "pc-activeBusiness"],
    ["migration_v1_done", MIGRATION_V1_DONE_KEY],
    ["migration_docs_v2_done", MIGRATION_DOCS_V2_DONE_KEY],
    ["lastMarketBriefCheck", "pc-lastMarketBriefCheck"],
  ];

  for (const [from, to] of directKeys) {
    const value = localStorage.getItem(from);
    if (value != null && localStorage.getItem(to) == null) {
      localStorage.setItem(to, value);
    }
  }

  const prefixMigrations = [
    { fromPrefix: "chatHistory_", toPrefix: "pc-chatHistory_" },
    { fromPrefix: "memoryFacts_", toPrefix: "pc-memoryFacts_" },
    { fromPrefix: "docs_meta_", toPrefix: "pc-docs_meta_" },
    { fromPrefix: "currentChatId_", toPrefix: "pc-current-chat-id-" },
    { fromPrefix: "icc-current-chat-id-", toPrefix: "pc-current-chat-id-" },
  ];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;

    for (const { fromPrefix, toPrefix } of prefixMigrations) {
      if (!key.startsWith(fromPrefix) || key.startsWith(toPrefix)) continue;
      const suffix = key.slice(fromPrefix.length);
      const newKey = `${toPrefix}${suffix}`;
      if (localStorage.getItem(newKey) == null) {
        localStorage.setItem(newKey, localStorage.getItem(key));
      }
    }
  }

  localStorage.setItem(MIGRATION_PC_PREFIX_DONE_KEY, "true");
}
