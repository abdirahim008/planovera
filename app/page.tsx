import { redirect } from "next/navigation";

import LandingPage from "@/components/auth/LandingPage";
import { AUTH_BYPASS_ENABLED } from "@/lib/demo-access";
import { getSupabaseServerClient, isServerSupabaseConfigured } from "@/lib/supabase-server";

export default async function Page() {
  // The marketing page is for signed-out visitors only. A signed-in user who
  // lands on "/" is sent straight to their dashboard instead of seeing the
  // marketing splash. Demo mode keeps the splash (no real session to redirect).
  if (!AUTH_BYPASS_ENABLED && isServerSupabaseConfigured()) {
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/workspace");
  }

  return <LandingPage authenticated={AUTH_BYPASS_ENABLED} />;
}
