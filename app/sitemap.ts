import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo";
import { TEMPLATE_SLUGS } from "@/lib/templates/registry";

// Public, indexable URLs. Template pages are read from the registry, so a new
// entry there appears here automatically — no manual edits needed.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/templates`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...TEMPLATE_SLUGS.map((slug) => ({
      url: `${SITE_URL}/templates/${slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
