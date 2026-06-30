import { redirect } from "next/navigation";

import LandingPage from "@/components/auth/LandingPage";
import { AUTH_BYPASS_ENABLED } from "@/lib/demo-access";
import { getSupabaseServerClient, isServerSupabaseConfigured } from "@/lib/supabase-server";
import { SITE_URL, SITE_NAME, DEFAULT_DESCRIPTION } from "@/lib/seo";

// Structured data so Google can render Planovera as a software product with a
// free-trial offer. Organization + SoftwareApplication, linked via @graph.
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/brand/planovera-logo-horizontal.png`,
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#software`,
      name: SITE_NAME,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: SITE_URL,
      description: DEFAULT_DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#organization` },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        description: "Free 30-day trial",
      },
    },
  ],
};

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

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingPage authenticated={AUTH_BYPASS_ENABLED} />
    </>
  );
}
