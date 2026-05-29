"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type CompactKpiTone = "accent" | "ok" | "warn" | "err" | "neutral";

export type CompactKpiRow = {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  tone?: CompactKpiTone;
  /** Overrides the tone-derived value color when set. */
  valueClassName?: string;
  onClick?: () => void;
};

const toneValueText: Record<CompactKpiTone, string> = {
  accent: "text-accent",
  ok: "text-ok",
  warn: "text-warn",
  err: "text-err",
  neutral: "text-white",
};

const toneIcon: Record<CompactKpiTone, string> = {
  accent: "bg-accent/10 text-accent",
  ok: "bg-ok/10 text-ok",
  warn: "bg-warn/10 text-warn",
  err: "bg-err/10 text-err",
  neutral: "bg-white/5 text-txt-muted",
};

/**
 * Dark-themed striped KPI list used to collapse stacked metric cards into a
 * compact table on small screens. Render it inside a `sm:hidden` wrapper and
 * keep the desktop card grid behind `hidden sm:grid`.
 */
export default function CompactKpiList({
  rows,
  header,
  className = "",
}: {
  rows: CompactKpiRow[];
  /** Optional column header row, e.g. { label: "Metric", value: "Value" }. */
  header?: { label?: string; value?: string };
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-xl border border-border bg-bg-surface ${className}`}>
      {header ? (
        <div className="flex items-center justify-between border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-txt-dim">
          <span>{header.label ?? "Metric"}</span>
          <span>{header.value ?? "Value"}</span>
        </div>
      ) : null}
      {rows.map((row, index) => {
        const tone = row.tone ?? "neutral";
        const Icon = row.icon;
        const striped = index % 2 === 1;
        const content = (
          <>
            {Icon ? (
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${toneIcon[tone]}`}
              >
                <Icon size={13} />
              </span>
            ) : null}
            <span className="min-w-0 flex-1 truncate text-[13px] text-txt-muted">{row.label}</span>
            <span
              className={`shrink-0 font-mono text-[13px] font-semibold tabular-nums ${
                row.valueClassName ?? toneValueText[tone]
              }`}
            >
              {row.value}
            </span>
          </>
        );

        if (row.onClick) {
          return (
            <button
              key={`${row.label}-${index}`}
              type="button"
              onClick={row.onClick}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-bg-hover/50 ${
                striped ? "bg-white/[0.025]" : "bg-transparent"
              }`}
            >
              {content}
            </button>
          );
        }

        return (
          <div
            key={`${row.label}-${index}`}
            className={`flex w-full items-center gap-2.5 px-3 py-2 ${
              striped ? "bg-white/[0.025]" : "bg-transparent"
            }`}
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}
