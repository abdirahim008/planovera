import { NextResponse } from "next/server";

import { getSupabaseServerClient, isServerSupabaseConfigured } from "@/lib/supabase-server";

// OAuth (e.g. Google) redirects back here with a one-time `code`. We exchange it
// for a session (sets the auth cookies via the SSR server client), then forward
// the user to wherever they were headed (`next`, default the workspace).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error_description") || searchParams.get("error");

  const nextParam = searchParams.get("next") || "/workspace";
  // Only allow internal relative redirects to avoid open-redirect abuse.
  const safeNext = nextParam.startsWith("/") ? nextParam : "/workspace";

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error)}`);
  }

  if (!code || !isServerSupabaseConfigured()) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = getSupabaseServerClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(exchangeError.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
