import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo";

// Public, indexable URLs. Add marketing/template pages here as they ship
// (e.g. `${SITE_URL}/templates/interim-payment-certificate`).
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
