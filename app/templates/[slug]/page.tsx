import type { Metadata } from "next";
import { notFound } from "next/navigation";

import TemplatePage from "@/components/templates/TemplatePage";
import { TEMPLATES, TEMPLATE_SLUGS } from "@/lib/templates/registry";
import { SITE_URL, SITE_NAME } from "@/lib/seo";

export function generateStaticParams() {
  return TEMPLATE_SLUGS.map((slug) => ({ slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const content = TEMPLATES[params.slug];
  if (!content) return {};
  const url = `${SITE_URL}/templates/${content.slug}`;
  return {
    title: content.title,
    description: content.metaDescription,
    keywords: content.keywords,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: content.title,
      description: content.metaDescription,
      siteName: SITE_NAME,
    },
    twitter: {
      card: "summary_large_image",
      title: content.title,
      description: content.metaDescription,
    },
  };
}

export default function TemplateSlugPage({ params }: { params: { slug: string } }) {
  const content = TEMPLATES[params.slug];
  if (!content) notFound();

  const url = `${SITE_URL}/templates/${content.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: "Templates", item: `${SITE_URL}/templates` },
          { "@type": "ListItem", position: 3, name: content.title, item: url },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: content.faq.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <TemplatePage content={content} />
    </>
  );
}
