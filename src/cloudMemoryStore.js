import { supabase } from "./supabase.js";

const TABLE = "memory";

let cloudUserId = null;

export function setCloudMemoryUser(userId) {
  cloudUserId = userId ?? null;
}

export function isCloudMemoryEnabled() {
  return Boolean(cloudUserId);
}

function cloudSyncFlagKey(userId) {
  return `migration_memory_cloud_${userId}_done`;
}

function rowToLocal(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    agent: row.agent ?? "shared",
    fact: row.fact,
    category: row.category ?? null,
    created_at: row.created_at,
  };
}

function localToRow(scopeId, row) {
  return {
    id: row.id,
    user_id: cloudUserId,
    scope_id: scopeId,
    agent: row.agent ?? "shared",
    fact: row.fact,
    category: row.category ?? null,
    created_at: row.created_at ?? new Date().toISOString(),
  };
}

export async function cloudListMemory(scopeId) {
  if (!cloudUserId) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("user_id", cloudUserId)
    .eq("scope_id", scopeId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message ?? "Failed to list cloud memory");
  }

  return (data ?? []).map(rowToLocal);
}

export async function cloudFindMemoryById(scopeId, factId) {
  if (!cloudUserId) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, fact")
    .eq("user_id", cloudUserId)
    .eq("scope_id", scopeId)
    .eq("id", factId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to query memory");
  return data;
}

export async function cloudFindMemoryByScopeFact(scopeId, factText) {
  if (!cloudUserId) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, fact")
    .eq("user_id", cloudUserId)
    .eq("scope_id", scopeId)
    .eq("fact", factText)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to query memory");
  return data;
}

export async function cloudInsertMemoryFact(scopeId, row) {
  if (!cloudUserId) {
    throw new Error("Cloud memory requires a signed-in user");
  }

  const { error } = await supabase.from(TABLE).insert(localToRow(scopeId, row));

  if (error) {
    throw new Error(error.message ?? "Failed to save memory fact");
  }
}

export async function cloudDeleteMemoryFact(scopeId, factId) {
  if (!cloudUserId) return;

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("user_id", cloudUserId)
    .eq("scope_id", scopeId)
    .eq("id", factId);

  if (error) {
    throw new Error(error.message ?? "Failed to delete memory fact");
  }
}

export async function cloudReplaceAllMemory(scopeId, rows) {
  if (!cloudUserId) {
    throw new Error("Cloud memory requires a signed-in user");
  }

  const { error: deleteError } = await supabase
    .from(TABLE)
    .delete()
    .eq("user_id", cloudUserId)
    .eq("scope_id", scopeId);

  if (deleteError) {
    throw new Error(deleteError.message ?? "Failed to clear cloud memory");
  }

  if (!rows?.length) return [];

  const payload = rows.map((row) => localToRow(scopeId, row));
  const { error: insertError } = await supabase.from(TABLE).insert(payload);

  if (insertError) {
    throw new Error(insertError.message ?? "Failed to replace cloud memory");
  }

  return rows;
}

/**
 * Upload local memoryFacts_* keys to Supabase once per user (browser).
 */
export async function syncLocalMemoryToCloud() {
  if (!cloudUserId || typeof localStorage === "undefined") {
    return { skipped: true, reason: "no cloud user" };
  }

  const flagKey = cloudSyncFlagKey(cloudUserId);
  if (localStorage.getItem(flagKey)) {
    return { skipped: true, reason: "already synced" };
  }

  let uploaded = 0;

  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key?.startsWith("memoryFacts_")) continue;

    const scopeId = key.slice("memoryFacts_".length);
    let rows = [];

    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
      rows = Array.isArray(parsed) ? parsed : [];
    } catch {
      continue;
    }

    for (const row of rows) {
      if (!row?.id || !row?.fact) continue;

      try {
        const { data: existing } = await supabase
          .from(TABLE)
          .select("id")
          .eq("user_id", cloudUserId)
          .eq("scope_id", scopeId)
          .eq("id", row.id)
          .maybeSingle();

        if (!existing) {
          await cloudInsertMemoryFact(scopeId, {
            ...row,
            user_id: cloudUserId,
          });
          uploaded += 1;
        }
      } catch (err) {
        console.warn(`[memory] Cloud sync failed for ${row.id}:`, err);
      }
    }
  }

  localStorage.setItem(flagKey, "true");
  console.log("[memory] Local → cloud sync complete", { uploaded });
  return { uploaded };
}

/** Discover scope ids present in localStorage memory keys. */
export function listLocalMemoryScopeIds() {
  if (typeof localStorage === "undefined") return [];

  const scopes = new Set();
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith("memoryFacts_")) {
      scopes.add(key.slice("memoryFacts_".length));
    }
  }
  return [...scopes];
}
