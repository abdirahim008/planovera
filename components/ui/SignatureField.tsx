"use client";

import { PenLine } from "lucide-react";

import type { UserSignatureProfile } from "@/lib/supabase";

/**
 * Reusable signatory field: a name input with a button to apply the user's
 * saved digital signature (from their profile) to this slot, or leave it
 * blank. The signature itself is the image stored on the profile; this control
 * only toggles whether it appears here.
 */
export default function SignatureField({
  label,
  value,
  onChange,
  source,
  onSourceChange,
  profile,
  placeholder,
  inputClassName = "",
  labelClassName = "",
}: {
  label?: string;
  value: string;
  onChange: (next: string) => void;
  source: "saved" | "none";
  onSourceChange: (next: "saved" | "none") => void;
  profile: UserSignatureProfile | null | undefined;
  placeholder?: string;
  inputClassName?: string;
  labelClassName?: string;
}) {
  const hasSaved = Boolean(profile?.imageDataUrl);
  const applied = source === "saved" && hasSaved;
  return (
    <div>
      {label ? <label className={labelClassName}>{label}</label> : null}
      <div className="relative">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${inputClassName} pr-10`}
        />
        <button
          type="button"
          disabled={!hasSaved}
          onClick={() => onSourceChange(applied ? "none" : "saved")}
          title={
            hasSaved
              ? applied
                ? "Signature applied — click to remove"
                : "Apply your saved signature"
              : "Save a signature in your profile first (Documents → signature)"
          }
          aria-label="Apply saved signature"
          className={`absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-40 ${
            applied ? "border-accent bg-accent/10 text-accent" : "border-border text-txt-dim hover:text-txt"
          }`}
        >
          <PenLine size={14} />
        </button>
      </div>
      {applied && profile?.imageDataUrl ? (
        <div className="mt-1.5 flex items-center gap-2 rounded-md border border-accent/30 bg-accent/5 px-2 py-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={profile.imageDataUrl} alt="Saved signature" className="h-7 w-auto max-w-[140px] object-contain" />
          <span className="text-[11px] font-medium text-accent">Signature applied</span>
        </div>
      ) : null}
    </div>
  );
}
