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
    <div className="min-h-screen bg-[#0b0e14] px-6 py-10 text-[#e2e8f4]">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-lg items-center justify-center">
        <div className="w-full rounded-2xl border border-white/10 bg-[#12161f] p-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Organization invite
          </div>
          <h1 className="mt-2 text-xl font-semibold text-white">
            {email ? `Accept invite for ${email}` : "Accept invite"}
          </h1>

          <div className="mt-5 rounded-lg border border-white/10 bg-[#0b0e14] px-4 py-3 text-sm text-slate-300">
            {notice || "Validating your account..."}
          </div>

          <div className="mt-5 flex gap-3">
            <a
              href="/"
              className="inline-flex items-center justify-center rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/5"
            >
              Decline
            </a>
            <a
              href={`/login${token ? `?invite=${encodeURIComponent(token)}${email ? `&email=${encodeURIComponent(email)}` : ""}` : ""}`}
              className="inline-flex items-center justify-center rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-400"
            >
              Accept
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
