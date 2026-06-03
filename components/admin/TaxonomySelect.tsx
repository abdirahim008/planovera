"use client";

import { useState } from "react";

const CUSTOM = "__custom__";

/** Dropdown of curated options that falls back to a free-text input when "Custom…" is picked. */
export default function TaxonomySelect({
  label,
  value,
  options,
  placeholder,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  // Treat a value not in the curated list (and non-empty) as "custom".
  const isCustom = value !== "" && !options.includes(value);
  const [customMode, setCustomMode] = useState(isCustom);

  return (
    <div>
      <label className="text-[11px] font-semibold text-txt-muted uppercase tracking-[0.16em] block mb-1.5">
        {label}
      </label>
      {customMode || isCustom ? (
        <div className="flex gap-2">
          <input
            className="w-full px-3 py-2 bg-bg-input border border-border rounded-md text-sm text-txt outline-none focus:border-accent"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            autoFocus
          />
          {options.length > 0 ? (
            <button
              type="button"
              className="shrink-0 rounded-md border border-border px-2.5 text-xs text-txt-muted hover:text-txt hover:bg-bg-hover"
              onClick={() => {
                setCustomMode(false);
                onChange("");
              }}
            >
              List
            </button>
          ) : null}
        </div>
      ) : (
        <select
          className="w-full px-3 py-2 bg-bg-input border border-border rounded-md text-sm text-txt outline-none focus:border-accent"
          value={options.includes(value) ? value : ""}
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value === CUSTOM) {
              setCustomMode(true);
              onChange("");
            } else {
              onChange(e.target.value);
            }
          }}
        >
          <option value="">{placeholder}</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
          <option value={CUSTOM}>+ Custom…</option>
        </select>
      )}
    </div>
  );
}
