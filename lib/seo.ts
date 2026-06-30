// Central SEO/site constants. Reused by the root metadata, robots, sitemap,
// JSON-LD, and any future marketing/template pages.
//
// IMPORTANT: set NEXT_PUBLIC_SITE_URL to the real production domain (e.g.
// https://app.planovera.com) so canonical URLs, Open Graph tags and the
// sitemap point at the right host. The fallback is only a sensible default.

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://planovera.com"
).replace(/\/+$/, "");

export const SITE_NAME = "Planovera";

export const DEFAULT_TITLE = "Planovera — Construction Project Controls Software";

export const DEFAULT_DESCRIPTION =
  "Planovera is project-controls software for contractors, consultants and clients — BOQ, FIDIC payment certificates, work plans, progress reports and project documents, with an AI assistant. Free 30-day trial.";

// Open Graph / Twitter preview image. TODO: replace with a purpose-built
// 1200×630 image at /public/og.png for best link previews.
export const OG_IMAGE = "/brand/planovera-logo-horizontal.png";

export const SITE_KEYWORDS = [
  "construction project controls software",
  "BOQ software",
  "bill of quantities software",
  "interim payment certificate template",
  "FIDIC payment certificate",
  "quantity surveying software",
  "construction progress report",
  "construction work plan software",
  "construction document software",
  "AI BOQ generator",
];
