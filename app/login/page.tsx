import { Suspense } from "react";
import { redirect } from "next/navigation";

import AuthPage from "@/components/auth/AuthPage";
import { AUTH_BYPASS_ENABLED } from "@/lib/demo-access";
import { getSupabaseServerClient, isServerSupabaseConfigured } from "@/lib/supabase-server";

// Auth page — keep out of search results.
export const metadata = { robots: { index: false, follow: false } };

export default async function LoginPage() {
  if (AUTH_BYPASS_ENABLED) {
    redirect("/workspace");
  }

  if (isServerSupabaseConfigured()) {
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      redirect("/workspace");
    }
  }

  return (
    <Suspense fallback={null}>
      <AuthPage />
    </Suspense>
  );
}
