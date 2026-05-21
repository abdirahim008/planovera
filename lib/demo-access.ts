// Local demo stays available until real Supabase credentials are configured.
// Set NEXT_PUBLIC_AUTH_BYPASS explicitly when you need to force either mode.
function isValidHttpUrl(value?: string) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const explicitBypass = process.env.NEXT_PUBLIC_AUTH_BYPASS?.trim().toLowerCase();
const hasSupabaseConfig =
  isValidHttpUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const AUTH_BYPASS_ENABLED =
  explicitBypass === "true" || explicitBypass === "1" || explicitBypass === "yes"
    ? true
    : explicitBypass === "false" || explicitBypass === "0" || explicitBypass === "no"
      ? false
      : !hasSupabaseConfig;
