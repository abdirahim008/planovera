import { Suspense } from "react";
import { redirect } from "next/navigation";

import AuthPage from "@/components/auth/AuthPage";
import { AUTH_BYPASS_ENABLED } from "@/lib/demo-access";
import { getSupabaseServerClient, isServerSupabaseConfigured } from "@/lib/supabase-server";

export default async function LoginPage() {
  if (AUTH_BYPASS_ENABLED) {
    redirect("/");
  }

  if (isServerSupabaseConfigured()) {
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      redirect("/");
    }
  }

  return (
    <Suspense fallback={null}>
      <AuthPage />
    </Suspense>
  );
}
