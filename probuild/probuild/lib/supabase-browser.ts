import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { AUTH_BYPASS_ENABLED } from "./demo-access";

let browserClient: SupabaseClient | null = null;

function getSupabaseConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

function isValidHttpUrl(value?: string) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isSupabaseConfigured() {
  if (AUTH_BYPASS_ENABLED) return false;

  const { url, anonKey } = getSupabaseConfig();
  return Boolean(isValidHttpUrl(url) && anonKey);
}

export function getSupabaseBrowserClient() {
  if (AUTH_BYPASS_ENABLED) return null;
  if (typeof window === "undefined") return null;

  const { url, anonKey } = getSupabaseConfig();
  if (!url || !isValidHttpUrl(url) || !anonKey) return null;

  if (!browserClient) {
    browserClient = createBrowserClient(url, anonKey);
  }

  return browserClient;
}
