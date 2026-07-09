"use client";

// In-app feedback: users submit experience ratings / problems / suggestions;
// platform admins triage them in /admin. Supabase-backed with RLS (insert own,
// admin read/update) — demo mode has no server, so submission is unavailable.

import { getSupabaseBrowserClient, isSupabaseConfigured } from "./supabase-browser";

export type FeedbackCategory = "problem" | "idea" | "other";
export type FeedbackStatus = "new" | "reviewed";

export interface FeedbackEntry {
  id: string;
  user_email: string | null;
  rating: number | null;
  category: FeedbackCategory;
  message: string;
  module: string | null;
  page: string | null;
  user_agent: string | null;
  status: FeedbackStatus;
  created_at: string;
}

export async function submitFeedback(input: {
  rating: number | null;
  category: FeedbackCategory;
  message: string;
  module: string;
}): Promise<{ error?: string }> {
  if (!isSupabaseConfigured()) {
    return { error: "Feedback needs the live app — it isn't available in demo mode." };
  }
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Not connected." };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to send feedback." };

  const { error } = await supabase.from("feedback").insert({
    user_id: user.id,
    user_email: user.email ?? null,
    rating: input.rating,
    category: input.category,
    message: input.message.trim(),
    module: input.module || null,
    page: typeof window !== "undefined" ? window.location.pathname : null,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
  });
  return error ? { error: error.message } : {};
}

export async function fetchFeedback(): Promise<{ entries: FeedbackEntry[]; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { entries: [] };
  await supabase.auth.getSession();
  const { data, error } = await supabase
    .from("feedback")
    .select("id,user_email,rating,category,message,module,page,user_agent,status,created_at")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return { entries: [], error: error.message };
  return { entries: (data ?? []) as FeedbackEntry[] };
}

export async function setFeedbackStatus(
  id: string,
  status: FeedbackStatus,
): Promise<{ error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Not connected." };
  const { error } = await supabase.from("feedback").update({ status }).eq("id", id);
  return error ? { error: error.message } : {};
}

export async function fetchNewFeedbackCount(): Promise<number> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return 0;
  await supabase.auth.getSession();
  const { count, error } = await supabase
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");
  return error ? 0 : count ?? 0;
}

/**
 * Cross-component opener: the sidebar owns the modal; other surfaces (e.g. the
 * assistant panel) request it via this event so they don't need shared state.
 */
export const OPEN_FEEDBACK_EVENT = "planovera:open-feedback";

export function requestFeedbackForm() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_FEEDBACK_EVENT));
}
