"use client";

import clsx from "clsx";

interface BadgeProps {
  children: React.ReactNode;
  color?: "accent" | "ok" | "warn" | "err" | "purple";
  className?: string;
}

const colorMap = {
  accent: "bg-accent/15 text-accent",
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  err: "bg-err/15 text-err",
  purple: "bg-purple-500/15 text-purple-400",
};

export default function Badge({ children, color = "accent", className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide items-center",
        colorMap[color],
        className
      )}
    >
      {children}
    </span>
  );
}
