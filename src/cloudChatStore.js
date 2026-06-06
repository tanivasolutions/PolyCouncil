import { supabase } from "./supabase.js";

const CHATS_TABLE = "chats";
const MESSAGES_TABLE = "messages";

let cloudUserId = null;

export function setCloudChatUser(userId) {
  cloudUserId = userId ?? null;
}

export function isCloudChatEnabled() {
  return Boolean(cloudUserId);
}

function cloudSyncFlagKey(userId) {
  return `migration_chats_cloud_${userId}_done`;
}

function chatRowToLocal(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title ?? "Untitled chat",
    created_at: row.created_at,
    updated_at: row.updated_at,
    moduleId: row.module_id ?? row.scope_id,
    moduleType: row.module_type ?? null,
    moduleName: row.module_name ?? null,
    ...(row.business_id != null ? { businessId: row.business_id } : {}),
  };
}

function chatLocalToRow(scopeId, chat) {
  return {
    id: chat.id,
    user_id: cloudUserId,
    scope_id: scopeId,
    title: chat.title ?? "Untitled chat",
    module_id: chat.moduleId ?? scopeId,
    module_type: chat.moduleType ?? null,
    module_name: chat.moduleName ?? null,
    business_id: chat.businessId ?? null,
    created_at: chat.created_at ?? new Date().toISOString(),
    updated_at: chat.updated_at ?? new Date().toISOString(),
  };
}

function messageRowToLocal(row) {
  return {
    id: row.id,
    chat_id: row.chat_id,
    user_id: row.user_id,
    role: row.role,
    content: row.content,
    ...(row.agent ? { agent: row.agent } : {}),
    ...(row.attachments ? { attachments: row.attachments } : {}),
    ...(row.flagged_by != null ? { flagged_by: row.flagged_by } : {}),
    created_at: row.created_at,
  };
}

function messageLocalToRow(message) {
  return {
    id: message.id,
    chat_id: message.chat_id,
    user_id: message.user_id ?? cloudUserId,
    role: message.role,
    agent: message.role === "assistant" ? (message.agent ?? "assistant") : null,
    content: message.content,
    attachments: message.attachments ?? null,
    flagged_by: message.flagged_by ?? null,
    created_at: message.created_at ?? new Date().toISOString(),
  };
}

/** Load full chat store for a scope from Supabase. */
export async function cloudLoadChatStore(scopeId) {
  if (!cloudUserId) {
    return { chats: [], messages: {} };
  }

  const { data: chatRows, error: chatError } = await supabase
    .from(CHATS_TABLE)
    .select("*")
    .eq("user_id", cloudUserId)
    .eq("scope_id", scopeId)
    .order("updated_at", { ascending: false });

  if (chatError) {
    throw new Error(chatError.message ?? "Failed to load cloud chats");
  }

  const chats = (chatRows ?? []).map(chatRowToLocal);
  const messages = {};

  if (!chats.length) {
    return { chats, messages };
  }

  const chatIds = chats.map((c) => c.id);
  const { data: messageRows, error: messageError } = await supabase
    .from(MESSAGES_TABLE)
    .select("*")
    .in("chat_id", chatIds)
    .order("created_at", { ascending: true });

  if (messageError) {
    throw new Error(messageError.message ?? "Failed to load cloud messages");
  }

  for (const row of messageRows ?? []) {
    const local = messageRowToLocal(row);
    if (!messages[local.chat_id]) {
      messages[local.chat_id] = [];
    }
    messages[local.chat_id].push(local);
  }

  return { chats, messages };
}

export async function cloudUpsertChat(scopeId, chat) {
  if (!cloudUserId) {
    throw new Error("Cloud chats require a signed-in user");
  }

  const { error } = await supabase
    .from(CHATS_TABLE)
    .upsert(chatLocalToRow(scopeId, chat), { onConflict: "id" });

  if (error) {
    throw new Error(error.message ?? "Failed to save chat");
  }
}

export async function cloudInsertMessage(message) {
  if (!cloudUserId) {
    throw new Error("Cloud chats require a signed-in user");
  }

  const { error } = await supabase
    .from(MESSAGES_TABLE)
    .upsert(messageLocalToRow(message), { onConflict: "id" });

  if (error) {
    throw new Error(error.message ?? "Failed to save message");
  }
}

export async function cloudTouchChat(chatId, updatedAt) {
  if (!cloudUserId) return;

  const { error } = await supabase
    .from(CHATS_TABLE)
    .update({ updated_at: updatedAt })
    .eq("id", chatId)
    .eq("user_id", cloudUserId);

  if (error) {
    throw new Error(error.message ?? "Failed to update chat timestamp");
  }
}

export async function cloudDeleteChat(chatId) {
  if (!cloudUserId) return;

  const { error: messageError } = await supabase
    .from(MESSAGES_TABLE)
    .delete()
    .eq("chat_id", chatId);

  if (messageError) {
    throw new Error(messageError.message ?? "Failed to delete chat messages");
  }

  const { error: chatError } = await supabase
    .from(CHATS_TABLE)
    .delete()
    .eq("id", chatId)
    .eq("user_id", cloudUserId);

  if (chatError) {
    throw new Error(chatError.message ?? "Failed to delete chat");
  }
}

async function chatExists(chatId) {
  const { data, error } = await supabase
    .from(CHATS_TABLE)
    .select("id")
    .eq("user_id", cloudUserId)
    .eq("id", chatId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to check chat");
  }

  return Boolean(data);
}

async function messageExists(messageId) {
  const { data, error } = await supabase
    .from(MESSAGES_TABLE)
    .select("id")
    .eq("id", messageId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to check message");
  }

  return Boolean(data);
}

/** Upload local chatHistory_* stores to Supabase once per user (browser). */
export async function syncLocalChatsToCloud() {
  if (!cloudUserId || typeof localStorage === "undefined") {
    return { skipped: true, reason: "no cloud user" };
  }

  const flagKey = cloudSyncFlagKey(cloudUserId);
  if (localStorage.getItem(flagKey)) {
    return { skipped: true, reason: "already synced" };
  }

  let chatsUploaded = 0;
  let messagesUploaded = 0;

  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key?.startsWith("chatHistory_")) continue;

    const scopeId = key.slice("chatHistory_".length);
    let store = { chats: [], messages: {} };

    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? "{}");
      store = {
        chats: Array.isArray(parsed.chats) ? parsed.chats : [],
        messages:
          parsed.messages && typeof parsed.messages === "object"
            ? parsed.messages
            : {},
      };
    } catch {
      continue;
    }

    for (const chat of store.chats) {
      if (!chat?.id) continue;

      try {
        if (!(await chatExists(chat.id))) {
          await cloudUpsertChat(scopeId, chat);
          chatsUploaded += 1;
        }

        const messages = store.messages[chat.id] ?? [];
        for (const message of messages) {
          if (!message?.id) continue;
          if (!(await messageExists(message.id))) {
            await cloudInsertMessage(message);
            messagesUploaded += 1;
          }
        }
      } catch (err) {
        console.warn(`[chats] Cloud sync failed for chat ${chat.id}:`, err);
      }
    }
  }

  localStorage.setItem(flagKey, "true");
  console.log("[chats] Local → cloud sync complete", {
    chatsUploaded,
    messagesUploaded,
  });

  return { chatsUploaded, messagesUploaded };
}
