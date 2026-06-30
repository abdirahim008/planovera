import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo";

// Crawlers may index the public marketing/template pages; the signed-in app,
// auth flows, API and the drawing canvas are kept out of the index.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/workspace",
          "/organization",
          "/admin",
          "/api/",
          "/auth/",
          "/login",
          "/invite",
          "/drawings/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
