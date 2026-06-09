import LandingPage from "@/components/auth/LandingPage";
import { AUTH_BYPASS_ENABLED } from "@/lib/demo-access";
import { getSupabaseServerClient, isServerSupabaseConfigured } from "@/lib/supabase-server";

export default async function Page() {
  // Reflect the session in the landing CTAs: an already-signed-in visitor sees
  // "Go to workspace" / "Sign out" instead of a "Sign in" button that would
  // just bounce them to the dashboard. Demo mode needs no login, so treat it as
  // signed in.
  let authenticated = AUTH_BYPASS_ENABLED;
  if (!AUTH_BYPASS_ENABLED && isServerSupabaseConfigured()) {
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    authenticated = Boolean(user);
  }

  return <LandingPage authenticated={authenticated} />;
}
