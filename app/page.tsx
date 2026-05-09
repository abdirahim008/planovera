import { redirect } from "next/navigation";

import Editor from "@/components/Editor";
import { getSupabaseServerClient, isServerSupabaseConfigured } from "@/lib/supabase-server";

export default async function Home() {
  if (!isServerSupabaseConfigured()) {
    redirect("/login");
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <Editor />;
}
