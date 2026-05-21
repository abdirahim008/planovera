import { redirect } from "next/navigation";

import AdminConsole from "@/components/admin/AdminConsole";
import {
  getSupabaseServerClient,
  isServerSupabaseConfigured,
} from "@/lib/supabase-server";

export default async function AdminPage() {
  if (isServerSupabaseConfigured()) {
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "admin") {
      redirect("/");
    }
  }

  return <AdminConsole />;
}
