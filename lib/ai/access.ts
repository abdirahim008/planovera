// Server-only access guard for the AI API routes.
//
// The AI routes call a paid model (DeepSeek) with the server-side API key, so
// they must not be callable by anonymous visitors — otherwise anyone can loop
// requests and burn the key. This guard requires a valid Supabase session when
// Supabase is configured, and stays out of the way in demo mode (AUTH_BYPASS /
// no Supabase), where there is no auth system to check against and the whole
// app runs on local state anyway.

import { getSupabaseServerClient, isServerSupabaseConfigured } from "@/lib/supabase-server";

export async function isAiRequestAuthorized(): Promise<boolean> {
  // Demo mode: no Supabase, no sessions — allow (the app is single-user local).
  if (!isServerSupabaseConfigured()) return true;

  try {
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    return Boolean(user && !error);
  } catch {
    return false;
  }
}
