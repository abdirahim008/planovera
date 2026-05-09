"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-browser";

export default function InvitePage({
  token,
  email,
}: {
  token?: string | null;
  email?: string | null;
}) {
  const router = useRouter();
  const configured = isSupabaseConfigured();
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) {
      setNotice("Supabase environment variables are missing.");
      return;
    }

    if (!token) {
      setNotice("This invite link is missing a token.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setNotice("Supabase environment variables are missing.");
      return;
    }

    let active = true;

    const handleInvite = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;

      if (!user) {
        router.replace(
          `/login?invite=${encodeURIComponent(token)}${
            email ? `&email=${encodeURIComponent(email)}` : ""
          }`,
        );
        return;
      }

      const { error } = await supabase.rpc("accept_organization_invites", {
        invite_token_param: token,
      });

      if (!active) return;

      if (error) {
        setNotice(error.message);
        return;
      }

      router.replace("/organization?joined=1");
      router.refresh();
    };

    void handleInvite();

    return () => {
      active = false;
    };
  }, [configured, email, router, token]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(30,64,175,0.12),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(15,23,42,0.14),_transparent_36%),linear-gradient(180deg,_#f8fafc,_#eef2ff)] px-6 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center justify-center">
        <div className="w-full rounded-[32px] border border-white/70 bg-white/88 p-8 shadow-[0_30px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.34em] text-slate-500">
            Organization Invite
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950">
            Joining your team workspace
          </h1>
          <p className="mt-4 text-sm leading-7 text-slate-600">
            {email
              ? `We’re validating this invite for ${email}.`
              : "We’re validating your team invitation and preparing the shared workspace."}
          </p>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
            {notice || "Checking your account and applying the reserved organization seat..."}
          </div>

          <div className="mt-6 flex gap-3">
            <a
              href="/"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Back to workspace
            </a>
            <a
              href={`/login${token ? `?invite=${encodeURIComponent(token)}${email ? `&email=${encodeURIComponent(email)}` : ""}` : ""}`}
              className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Sign in with invited email
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
