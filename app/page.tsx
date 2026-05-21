import { redirect } from "next/navigation";

import WorkspaceShell from "@/components/layout/WorkspaceShell";
import { getSupabaseServerClient, isServerSupabaseConfigured } from "@/lib/supabase-server";

export default async function Page() {
  if (isServerSupabaseConfigured()) {
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
