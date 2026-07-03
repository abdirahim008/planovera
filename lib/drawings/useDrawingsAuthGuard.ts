"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-browser";

/**
 * Client-side auth guard for the standalone drawing tabs (studio + warehouse).
 * Middleware already blocks unauthenticated navigation to /drawings/*, but a tab
 * that is already open won't re-run middleware — so when the user signs out
 * (here or in another tab), this listener kicks the open tab to /login.
 *
 * No-ops in demo mode (Supabase not configured), where there is no auth system.
 */
export function useDrawingsAuthGuard() {
  const router = useRouter();

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let active = true;
    const toLogin = () => {
      if (active) router.replace("/login");
    };

    // Guard the initial state too (belt-and-suspenders behind middleware).
    supabase.auth.getUser().then(({ data }) => {
      if (active && !data.user) toLogin();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session?.user) toLogin();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);
}
