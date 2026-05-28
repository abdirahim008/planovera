import { redirect } from "next/navigation";

import WorkspaceShell from "@/components/layout/WorkspaceShell";
import { AUTH_BYPASS_ENABLED } from "@/lib/demo-access";
import { getSupabaseServerClient, isServerSupabaseConfigured } from "@/lib/supabase-server";

export default async function WorkspacePage() {
  if (!AUTH_BYPASS_ENABLED && isServerSupabaseConfigured()) {
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }
  }

  return <WorkspaceShell />;
}
