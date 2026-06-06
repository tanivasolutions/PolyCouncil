import { createClient } from "@supabase/supabase-js";

const VITE_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const VITE_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!VITE_SUPABASE_URL || !VITE_SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing Supabase config. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local, then restart the dev server."
  );
}

export const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, {
  auth: {
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true,
  },
});

const AUTH_URL_PARAMS = [
  "access_token",
  "refresh_token",
  "expires_in",
  "token_type",
  "type",
  "error",
  "error_description",
  "error_code",
];

if (typeof window !== "undefined") {
  const { pathname, search, hash } = window.location;
  const params = new URLSearchParams(search);
  let dirty = false;

  for (const key of AUTH_URL_PARAMS) {
    if (params.has(key)) {
      params.delete(key);
      dirty = true;
    }
  }

  const hasAuthHash =
    hash &&
    (hash.includes("access_token") ||
      hash.includes("refresh_token") ||
      hash.includes("error="));

  if (dirty || hasAuthHash) {
    const query = params.toString();
    window.history.replaceState(
      {},
      document.title,
      pathname + (query ? `?${query}` : "")
    );
  }
}
