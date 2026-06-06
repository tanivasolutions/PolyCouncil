/** UI-only keys — localStorage/sessionStorage per browser; never synced to Supabase. */

export const LAST_BRIEF_KEY = "pc-lastMarketBriefCheck";

let storageSourcesLogged = false;

/** One-time hint: UI state is local; durable data uses Supabase when signed in. */
export function logStorageSources() {
  if (storageSourcesLogged) return;
  storageSourcesLogged = true;
  console.info(
    "[storage] Active UI state source: localStorage / sessionStorage (per browser — localhost and production stay independent).",
    "\n[storage] Durable data source: Supabase when signed in (chats, messages, memory, documents)."
  );
}
