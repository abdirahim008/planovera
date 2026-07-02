// Server-only request guard for the AI API routes.
//
// The AI routes call a paid model (DeepSeek) with the server-side API key, so
// they must not be callable by anonymous visitors — otherwise anyone can loop
// requests and burn the key. This guard:
//   1. Requires a valid Supabase session when Supabase is configured (real-auth
//      / production); it stays out of the way in demo mode (no Supabase), where
//      there is no auth system and the app runs on local state.
//   2. Rate-limits per user (or per IP in demo) as a second layer — no-op unless
//      Upstash is configured (see lib/ai/rateLimit.ts).

import { NextResponse } from "next/server";

import { getSupabaseServerClient, isServerSupabaseConfigured } from "@/lib/supabase-server";
import { checkAiRateLimit } from "@/lib/ai/rateLimit";

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || "unknown";
}

/**
 * Returns a NextResponse to send back (401/429) when the request should be
 * rejected, or null when it may proceed. Reads only headers/cookies — the
 * route can still consume the request body afterwards.
 */
export async function guardAiRequest(req: Request): Promise<NextResponse | null> {
  let identifier = `ip:${clientIp(req)}`;

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = getSupabaseServerClient();
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (error || !user) {
        return NextResponse.json({ error: "Sign in to use the assistant." }, { status: 401 });
      }
      identifier = `user:${user.id}`;
    } catch {
      return NextResponse.json({ error: "Sign in to use the assistant." }, { status: 401 });
    }
  }

  const { ok } = await checkAiRateLimit(identifier);
  if (!ok) {
    return NextResponse.json(
      { error: "You're sending requests too quickly. Please wait a moment and try again." },
      { status: 429 },
    );
  }

  return null;
}
