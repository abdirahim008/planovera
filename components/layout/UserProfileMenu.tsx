"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { LogOut, UserCog } from "lucide-react";

import { useAppStore } from "@/lib/store";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-browser";
import UserProfileModal from "./UserProfileModal";

function initials(name: string, email: string) {
  const source = (name || email || "").trim();
  if (!source) return "U";
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

/**
 * Profile avatar + dropdown shown in the sidebar footer. Replaces the bare
 * "Sign out" button: clicking the avatar opens a menu to manage the profile
 * (name, role, signature) or sign out. Works in demo mode too — it just hides
 * the sign-out action when there's no real session.
 */
export default function UserProfileMenu({ collapsed }: { collapsed: boolean }) {
  const router = useRouter();
  const authConfigured = isSupabaseConfigured();
  const { userSignatureProfile, clearProjectSelection, clearWorkspaceData, setProjects } = useAppStore();

  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [email, setEmail] = useState<string>("");
  const [name, setName] = useState<string>("");
  const wrapRef = useRef<HTMLDivElement>(null);

  // Pull the signed-in identity (email + full name) for the avatar + menu header.
  useEffect(() => {
    let active = true;
    if (!authConfigured) return;
    (async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !active) return;
      if (user.email) setEmail(user.email);
      const { data } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
      if (active && data?.full_name) setName(data.full_name as string);
    })();
    return () => {
      active = false;
    };
  }, [authConfigured]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const displayName = name || userSignatureProfile?.displayName || (authConfigured ? "My account" : "Demo user");
  const displayEmail = email || (authConfigured ? "" : "Demo mode");

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setSigningOut(true);
    clearProjectSelection();
    clearWorkspaceData();
    setProjects([]);
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "flex w-full items-center rounded-lg text-[13px] font-medium text-txt-muted transition-colors duration-150 hover:bg-bg-hover hover:text-txt",
          collapsed ? "justify-center p-1.5" : "gap-2.5 px-2 py-1.5",
        )}
        title={collapsed ? displayName : undefined}
        aria-label="Open profile menu"
      >
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-semibold text-white">
          {initials(displayName, displayEmail)}
        </span>
        {!collapsed ? (
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-[13px] font-semibold text-txt">{displayName}</span>
            {displayEmail ? <span className="block truncate text-[11px] text-txt-dim">{displayEmail}</span> : null}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className={clsx(
            "absolute bottom-[calc(100%+6px)] z-40 min-w-[210px] overflow-hidden rounded-xl border border-border bg-bg-surface py-1 shadow-[0_16px_44px_rgba(0,0,0,0.22)]",
            collapsed ? "left-0" : "left-0 right-0",
          )}
        >
          <div className="border-b border-border px-3 py-2">
            <div className="truncate text-[13px] font-semibold text-txt">{displayName}</div>
            {displayEmail ? <div className="truncate text-[11px] text-txt-dim">{displayEmail}</div> : null}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setProfileOpen(true);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-txt transition hover:bg-bg-hover"
          >
            <UserCog size={15} /> Manage profile
          </button>
          {authConfigured ? (
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-err transition hover:bg-err/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogOut size={15} /> {signingOut ? "Signing out..." : "Sign out"}
            </button>
          ) : null}
        </div>
      ) : null}

      <UserProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} email={displayEmail || undefined} />
    </div>
  );
}
