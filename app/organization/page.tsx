import { redirect } from "next/navigation";

import OrganizationWorkspace from "@/components/organization/OrganizationWorkspace";
import {
  getSupabaseServerClient,
  isServerSupabaseConfigured,
} from "@/lib/supabase-server";

export default async function OrganizationPage({
  searchParams,
}: {
  searchParams?: {
    joined?: string;
  };
}) {
  if (isServerSupabaseConfigured()) {
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }
  }

  return <OrganizationWorkspace joined={searchParams?.joined === "1"} />;
}
