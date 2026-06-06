/**
 * Per-scope UI load tokens and in-memory caches for chats, memory, and documents.
 * Used by chat.html to ignore stale async results after module/chat switches.
 */

export function createScopeUiState() {
  let currentModuleLoadId = 0;
  let currentChatLoadId = 0;
  let currentMemoryLoadId = 0;
  let currentDocumentsLoadId = 0;

  const chatsCache = new Map();
  const memoryCache = new Map();
  const docsCache = new Map();
  const messagesCache = new Map();

  const loading = {
    module: false,
    chats: false,
    messages: false,
    memory: false,
    documents: false,
  };

  return {
    get isLoadingModule() {
      return loading.module;
    },
    get isLoadingChats() {
      return loading.chats;
    },
    get isLoadingMessages() {
      return loading.messages;
    },
    get isLoadingMemory() {
      return loading.memory;
    },
    get isLoadingDocuments() {
      return loading.documents;
    },
    loading,

    chatsCache,
    memoryCache,
    docsCache,
    messagesCache,

    bumpModuleLoad() {
      currentModuleLoadId += 1;
      return currentModuleLoadId;
    },
    isModuleLoadCurrent(requestId) {
      return requestId === currentModuleLoadId;
    },
    get moduleLoadId() {
      return currentModuleLoadId;
    },

    bumpChatLoad() {
      currentChatLoadId += 1;
      return currentChatLoadId;
    },
    isChatLoadCurrent(requestId) {
      return requestId === currentChatLoadId;
    },

    bumpMemoryLoad() {
      currentMemoryLoadId += 1;
      return currentMemoryLoadId;
    },
    isMemoryLoadCurrent(requestId) {
      return requestId === currentMemoryLoadId;
    },

    bumpDocumentsLoad() {
      currentDocumentsLoadId += 1;
      return currentDocumentsLoadId;
    },
    isDocumentsLoadCurrent(requestId) {
      return requestId === currentDocumentsLoadId;
    },

    messagesCacheKey(scopeId, chatId) {
      return `${scopeId}:${chatId}`;
    },

    invalidateScope(scopeId) {
      chatsCache.delete(scopeId);
      memoryCache.delete(scopeId);
      for (const key of docsCache.keys()) {
        if (key.startsWith(`${scopeId}:`)) docsCache.delete(key);
      }
      for (const key of messagesCache.keys()) {
        if (key.startsWith(`${scopeId}:`)) messagesCache.delete(key);
      }
    },
  };
}

export function scopeLoadingHtml(message) {
  const safe = String(message ?? "Loading…")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `
    <div class="scope-loading" role="status" aria-live="polite">
      <div class="scope-loading-spinner" aria-hidden="true"></div>
      <p>${safe}</p>
    </div>
  `;
}
