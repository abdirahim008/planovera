import type { Metadata } from "next";
import Image from "next/image";
import { ArrowRight } from "lucide-react";

import { TEMPLATES, TEMPLATE_SLUGS } from "@/lib/templates/registry";
import { SITE_URL } from "@/lib/seo";

const TITLE = "Free Construction Document Templates";
const DESCRIPTION =
  "Free, ready-to-use construction document templates — bills of quantities, interim payment certificates and more — with worked examples and step-by-step guides.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/templates` },
  openGraph: { type: "website", url: `${SITE_URL}/templates`, title: TITLE, description: DESCRIPTION },
};

export default function TemplatesIndexPage() {
  const templates = TEMPLATE_SLUGS.map((slug) => TEMPLATES[slug]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-bg text-txt">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(37,99,235,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(37,99,235,0.05)_1px,transparent_1px)] bg-[size:64px_64px]" />

      <div className="relative mx-auto w-full max-w-4xl px-5 sm:px-8 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4 py-6">
          <a href="/" className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-white shadow-md">
              <Image src="/brand/planovera-mark.png" alt="Planovera" width={32} height={32} className="h-8 w-8 object-contain" />
            </span>
            <span className="text-lg font-extrabold tracking-tight text-txt">Planovera</span>
          </a>
          <nav className="flex items-center gap-3">
            <a
              href="/login"
              className="rounded-2xl border border-border bg-bg-surface px-4 py-2.5 text-sm font-semibold text-txt transition hover:border-accent/50 hover:bg-bg-hover"
            >
              Sign in
            </a>
            <a
              href="/login?mode=signup"
              className="rounded-2xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:bg-blue-400"
            >
              Start free trial
            </a>
          </nav>
        </header>

        <section className="py-10">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-blue-400/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
            Free templates
          </span>
          <h1 className="mt-5 text-3xl font-bold leading-[1.1] tracking-[-0.02em] text-txt sm:text-4xl">{TITLE}</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-txt-muted">
            Ready-to-use construction document templates with worked examples and step-by-step guides — built from the
            same logic Planovera uses to generate and auto-calculate these documents for live projects.
          </p>
        </section>

        <section className="grid gap-4 pb-16 sm:grid-cols-2">
          {templates.map((t) => (
            <a
              key={t.slug}
              href={`/templates/${t.slug}`}
              className="group flex flex-col rounded-2xl border border-border bg-bg-surface p-5 transition hover:border-accent/40 hover:bg-bg-hover"
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">{t.kicker}</span>
              <h2 className="mt-2 text-lg font-bold tracking-[-0.01em] text-txt">{t.title}</h2>
              <p className="mt-2 flex-1 text-[13px] leading-6 text-txt-muted">{t.metaDescription}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent">
                View template
                <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
              </span>
            </a>
          ))}
        </section>

        <footer className="flex flex-col items-center justify-between gap-4 border-t border-border py-8 sm:flex-row">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white">
              <Image src="/brand/planovera-mark.png" alt="Planovera" width={24} height={24} className="h-6 w-6 object-contain" />
            </span>
            <span className="text-sm font-semibold text-txt">Planovera</span>
          </div>
          <p className="text-[13px] text-txt-dim">&copy; {new Date().getFullYear()} Planovera. Project controls for delivery teams.</p>
          <a href="/login" className="text-[13px] font-semibold text-accent transition hover:text-accent-hover">
            Sign in
          </a>
        </footer>
      </div>
    </main>
  );
}
