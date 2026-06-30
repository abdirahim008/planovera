import Image from "next/image";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import type { SampleRow, TemplatePageContent } from "@/lib/templates/registry";
import { TEMPLATES } from "@/lib/templates/registry";

function SampleTableBlock({ table }: { table: TemplatePageContent["table"] }) {
  const colCount = table.columns.length;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-bg-surface shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-err/50" />
        <span className="h-2.5 w-2.5 rounded-full bg-warn/50" />
        <span className="h-2.5 w-2.5 rounded-full bg-ok/50" />
        <span className="ml-2 text-[11px] font-medium text-txt-muted">{table.caption}</span>
      </div>
      <div className="overflow-x-auto p-3 sm:p-4">
        <table className="w-full border-collapse text-left text-[12px] sm:min-w-[640px]">
          <thead>
            <tr className="border-b border-border text-[9px] uppercase tracking-[0.1em] text-txt-dim">
              {table.columns.map((col, i) => (
                <th
                  key={col}
                  className={`py-1.5 pr-3 font-semibold ${i > 1 ? "hidden text-right sm:table-cell" : ""}`}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row: SampleRow, i) => {
              if (row.type === "section")
                return (
                  <tr key={i} className="bg-accent/5">
                    <td colSpan={colCount} className="px-1 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
                      {row.label}
                    </td>
                  </tr>
                );
              if (row.type === "item")
                return (
                  <tr key={i} className="border-b border-border/60">
                    {row.cells.map((cell, c) => (
                      <td
                        key={c}
                        className={`py-1.5 pr-3 ${c > 1 ? "hidden text-right font-mono tabular-nums text-txt sm:table-cell" : "text-txt"}`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                );
              if (row.type === "subtotal")
                return (
                  <tr key={i} className="border-b border-border">
                    <td colSpan={colCount - 1} className="py-1.5 pr-3 text-right text-[11px] font-semibold text-txt-muted">
                      {row.label}
                    </td>
                    <td className="py-1.5 text-right font-mono font-semibold tabular-nums text-txt">{row.value}</td>
                  </tr>
                );
              return (
                <tr key={i}>
                  <td colSpan={colCount - 1} className="py-2 pr-3 text-right text-[12px] font-bold uppercase tracking-[0.06em] text-txt">
                    {row.label}
                  </td>
                  <td className="py-2 text-right font-mono text-[13px] font-bold tabular-nums text-accent">{row.value}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryBoxBlock({ box }: { box: NonNullable<TemplatePageContent["summaryBox"]> }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-bg-surface shadow-sm">
      <div className="border-b border-border px-4 py-2.5 text-[11px] font-medium text-txt-muted">{box.title}</div>
      <div className="divide-y divide-border/60 px-4 py-2">
        {box.rows.map((row, i) => (
          <div key={i} className={`flex items-center justify-between gap-4 py-2 ${row.emphasis ? "pt-3" : ""}`}>
            <span className={`text-[13px] ${row.emphasis ? "font-bold text-txt" : "text-txt-muted"}`}>{row.label}</span>
            <span
              className={`font-mono tabular-nums ${row.emphasis ? "text-[15px] font-bold text-accent" : "text-[13px] text-txt"}`}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TemplatePage({
  content,
  signupHref = "/login?mode=signup",
  signinHref = "/login",
}: {
  content: TemplatePageContent;
  signupHref?: string;
  signinHref?: string;
}) {
  const related = content.relatedSlugs.map((slug) => TEMPLATES[slug]).filter(Boolean);

  return (
    <main className="relative min-h-screen overflow-hidden bg-bg text-txt">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(37,99,235,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(37,99,235,0.05)_1px,transparent_1px)] bg-[size:64px_64px]" />

      <div className="relative mx-auto w-full max-w-4xl px-5 sm:px-8 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4 py-6">
          <a href="/" className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-white shadow-md">
              <Image
                src="/brand/planovera-mark.png"
                alt="Planovera"
                width={32}
                height={32}
                className="h-8 w-8 object-contain"
              />
            </span>
            <span className="text-lg font-extrabold tracking-tight text-txt">Planovera</span>
          </a>
          <nav className="flex items-center gap-3">
            <a
              href={signinHref}
              className="rounded-2xl border border-border bg-bg-surface px-4 py-2.5 text-sm font-semibold text-txt transition hover:border-accent/50 hover:bg-bg-hover"
            >
              Sign in
            </a>
            <a
              href={signupHref}
              className="rounded-2xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:bg-blue-400"
            >
              Start free trial
            </a>
          </nav>
        </header>

        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 py-2 text-[12px] text-txt-dim">
          <a href="/" className="hover:text-txt">Home</a>
          <span>/</span>
          <a href="/templates" className="hover:text-txt">Templates</a>
          <span>/</span>
          <span className="text-txt-muted">{content.title}</span>
        </nav>

        <section className="py-8 sm:py-10">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-blue-400/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
            {content.kicker}
          </span>
          <h1 className="mt-5 text-3xl font-bold leading-[1.1] tracking-[-0.02em] text-txt sm:text-4xl">
            {content.title}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-txt-muted">{content.intro}</p>
        </section>

        <section className="space-y-4 pb-10">
          <SampleTableBlock table={content.table} />
          {content.summaryBox ? <SummaryBoxBlock box={content.summaryBox} /> : null}
        </section>

        <section className="border-t border-border py-10">
          <h2 className="text-xl font-bold tracking-[-0.01em] text-txt sm:text-2xl">{content.howToTitle}</h2>
          <ol className="mt-5 space-y-3">
            {content.howToSteps.map((step, i) => (
              <li key={i} className="flex gap-3 text-[14px] leading-7 text-txt-muted">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[11px] font-bold text-accent">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t border-border py-10">
          <h2 className="text-xl font-bold tracking-[-0.01em] text-txt sm:text-2xl">Frequently asked questions</h2>
          <dl className="mt-5 space-y-5">
            {content.faq.map((item) => (
              <div key={item.q}>
                <dt className="text-[14px] font-semibold text-txt">{item.q}</dt>
                <dd className="mt-1.5 text-[14px] leading-7 text-txt-muted">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="py-10">
          <div className="relative overflow-hidden rounded-[2rem] border border-blue-500/20 bg-gradient-to-br from-blue-600 via-blue-500 to-teal-500 px-6 py-10 text-center sm:px-10">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.18),transparent_60%)]" />
            <div className="relative mx-auto max-w-xl">
              <h2 className="text-2xl font-bold tracking-[-0.02em] text-white sm:text-3xl">{content.ctaHeading}</h2>
              <p className="mt-3 text-[14px] leading-6 text-blue-50/90">{content.ctaBody}</p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <a
                  href={signupHref}
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-xl shadow-black/20 transition hover:bg-blue-50"
                >
                  Start free 30-day trial
                  <ArrowRight size={16} />
                </a>
              </div>
              <p className="mt-4 flex items-center justify-center gap-2 text-[12px] text-blue-50/80">
                <CheckCircle2 size={13} /> No credit card required
              </p>
            </div>
          </div>
        </section>

        {related.length > 0 ? (
          <section className="border-t border-border py-10">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-txt-dim">Related templates</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {related.map((t) => (
                <a
                  key={t.slug}
                  href={`/templates/${t.slug}`}
                  className="rounded-2xl border border-border bg-bg-surface px-4 py-2.5 text-sm font-semibold text-txt transition hover:border-accent/40 hover:bg-bg-hover"
                >
                  {t.title}
                </a>
              ))}
            </div>
          </section>
        ) : null}

        <footer className="flex flex-col items-center justify-between gap-4 border-t border-border py-8 sm:flex-row">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white">
              <Image
                src="/brand/planovera-mark.png"
                alt="Planovera"
                width={24}
                height={24}
                className="h-6 w-6 object-contain"
              />
            </span>
            <span className="text-sm font-semibold text-txt">Planovera</span>
          </div>
          <p className="text-[13px] text-txt-dim">&copy; {new Date().getFullYear()} Planovera. Project controls for delivery teams.</p>
          <a href={signinHref} className="text-[13px] font-semibold text-accent transition hover:text-accent-hover">
            Sign in
          </a>
        </footer>
      </div>
    </main>
  );
}
