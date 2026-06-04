"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import AuthScreen from "./AuthScreen";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-browser";

function formatAuthError(message: string) {
  if (message.toLowerCase().includes("invalid login credentials")) {
    return "The email or password is incorrect.";
  }
  return message;
}

export default function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const configured = isSupabaseConfigured();
  const inviteToken = searchParams.get("invite") || searchParams.get("token");
  const inviteEmail = searchParams.get("email");
  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "signin";
  // Google sign-in is implemented but disabled for launch (email-only). Flip it on
  // later by setting NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=true (and finishing the
  // Google/Supabase provider config) — no code changes required.
  const googleEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true";

  const finalizeAccess = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      router.replace("/workspace");
      router.refresh();
      return;
    }

    if (inviteToken) {
      const nextUrl = `/invite?token=${encodeURIComponent(inviteToken)}${
        inviteEmail ? `&email=${encodeURIComponent(inviteEmail)}` : ""
      }`;
      router.replace(nextUrl);
      router.refresh();
      return;
    }

    const { data, error } = await supabase.rpc("accept_organization_invites", {
      invite_token_param: null,
    });

    if (error) {
      router.replace("/workspace");
      router.refresh();
      return;
    }

    if (Number(data || 0) > 0) {
      router.replace("/organization?joined=1");
      router.refresh();
      return;
    }

    router.replace("/workspace");
    router.refresh();
  };

  const handleGoogle = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setNotice("Supabase environment variables are missing.");
      return;
    }

    // Preserve invite context through the OAuth round-trip: after Google returns
    // to /auth/callback we forward the user to the invite page (to claim the
    // reserved seat) or to the workspace.
    const nextPath = inviteToken
      ? `/invite?token=${encodeURIComponent(inviteToken)}${
          inviteEmail ? `&email=${encodeURIComponent(inviteEmail)}` : ""
        }`
      : "/workspace";
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      nextPath,
    )}`;

    setBusy(true);
    setNotice(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error) {
      setNotice(formatAuthError(error.message));
      setBusy(false);
    }
    // On success the browser is redirected to Google; no further action here.
  };

  const handleSignIn = async ({
    email,
    password,
  }: {
    email: string;
    password: string;
  }) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setNotice("Supabase environment variables are missing.");
      return;
    }

    setBusy(true);
    setNotice(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setNotice(formatAuthError(error.message));
    } else {
      setNotice("Sign-in successful. Loading your workspace...");
      await finalizeAccess();
    }

    setBusy(false);
  };

  const handleForgot = async ({ email }: { email: string }) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setNotice("Supabase environment variables are missing.");
      return;
    }

    const trimmed = email.trim();
    if (!trimmed) {
      setNotice("Enter your account email to receive a reset link.");
      return;
    }

    setBusy(true);
    setNotice(null);

    // The recovery email links back through /auth/callback, which exchanges the
    // one-time code for a session and forwards to /auth/reset where the user sets
    // a new password.
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      "/auth/reset",
    )}`;

    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo });

    if (error) {
      setNotice(formatAuthError(error.message));
    } else {
      // Always confirm without revealing whether the address has an account.
      setNotice(
        "If an account exists for that email, a password reset link is on its way. Check your inbox.",
      );
    }

    setBusy(false);
  };

  const handleSignUp = async ({
    name,
    company,
    email,
    password,
  }: {
    name: string;
    company: string;
    email: string;
    password: string;
  }) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setNotice("Supabase environment variables are missing.");
      return;
    }

    setBusy(true);
    setNotice(null);

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: name.trim(),
          company: company.trim(),
        },
      },
    });

    if (error) {
      setNotice(formatAuthError(error.message));
    } else if (!data.session) {
      setNotice(
        inviteToken
          ? "Account created. Confirm the account if required, then sign in with this invited email to join the organization."
          : "Account created. Check your email to confirm the account, then sign in.",
      );
    } else {
      setNotice("Account created. Loading your workspace...");
      await finalizeAccess();
    }

    setBusy(false);
  };

  return (
    <AuthScreen
      configured={configured}
      busy={busy}
      notice={notice}
      inviteEmail={inviteEmail}
      emailLocked={Boolean(inviteEmail)}
      initialMode={initialMode}
      onSignIn={handleSignIn}
      onSignUp={handleSignUp}
      onForgot={handleForgot}
      onGoogle={googleEnabled ? handleGoogle : undefined}
    />
  );
}
