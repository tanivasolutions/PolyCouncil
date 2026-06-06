import { supabase } from "./supabase.js";

const TABLE = "user_preferences";

let cloudUserId = null;

export const DEFAULT_USER_PREFERENCES = {
  active_module_id: "iron-city-cargo",
  active_business_id: "iron-city-cargo",
  sidebar_collapsed: false,
  current_chat_by_scope: {},
  last_market_brief_check: null,
};

export function setCloudPreferencesUser(userId) {
  cloudUserId = userId ?? null;
}

export function isCloudPreferencesEnabled() {
  return Boolean(cloudUserId);
}

function normalizePreferences(raw) {
  const base = { ...DEFAULT_USER_PREFERENCES };
  if (!raw || typeof raw !== "object") return base;

  return {
    active_module_id:
      raw.active_module_id ?? base.active_module_id,
    active_business_id:
      raw.active_business_id ?? base.active_business_id,
    sidebar_collapsed: Boolean(raw.sidebar_collapsed),
    current_chat_by_scope:
      raw.current_chat_by_scope && typeof raw.current_chat_by_scope === "object"
        ? { ...raw.current_chat_by_scope }
        : {},
    last_market_brief_check: raw.last_market_brief_check ?? null,
  };
}

export async function cloudLoadPreferences() {
  if (!cloudUserId) {
    return { ...DEFAULT_USER_PREFERENCES };
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select("preferences")
    .eq("user_id", cloudUserId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load preferences");
  }

  if (!data?.preferences) {
    return { ...DEFAULT_USER_PREFERENCES };
  }

  return normalizePreferences(data.preferences);
}

export async function cloudSavePreferences(preferences) {
  if (!cloudUserId) {
    throw new Error("Cloud preferences require a signed-in user");
  }

  const payload = normalizePreferences(preferences);

  const { error } = await supabase.from(TABLE).upsert(
    {
      user_id: cloudUserId,
      preferences: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    throw new Error(error.message ?? "Failed to save preferences");
  }

  return payload;
}
