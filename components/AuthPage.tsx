"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import AuthScreen from "./AuthScreen";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

function formatAuthError(message: string) {
  if (message.toLowerCase().includes("invalid login credentials")) {
    return "The email or password is incorrect.";
  }
  return message;
}

export default function AuthPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const configured = isSupabaseConfigured();

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
      router.replace("/");
      router.refresh();
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
      setNotice("Account created. Check your email to confirm the account, then sign in.");
    } else {
      setNotice("Account created. Loading your workspace...");
      router.replace("/");
      router.refresh();
    }

    setBusy(false);
  };

  return (
    <AuthScreen
      configured={configured}
      busy={busy}
      notice={notice}
      onSignIn={handleSignIn}
      onSignUp={handleSignUp}
    />
  );
}
