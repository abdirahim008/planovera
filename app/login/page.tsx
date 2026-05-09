import { redirect } from "next/navigation";

import AuthPage from "@/components/AuthPage";
import { getSupabaseServerClient, isServerSupabaseConfigured } from "@/lib/supabase-server";

export default async function LoginPage() {
  if (isServerSupabaseConfigured()) {
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      redirect("/");
    }
  }

  return <AuthPage />;
}
