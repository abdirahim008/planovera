"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Bold, List, ListOrdered, Type, Underline } from "lucide-react";

import {
  normalizeEditorHtml,
  plainTextToRichTextHtml,
  sanitizeRichTextHtml,
  stripRichTextToPlain,
} from "@/lib/richText";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: number;
}

/**
 * Lightweight rich text editor backed by `contentEditable` + `document.execCommand`.
 * Supports bold, underline, ordered/unordered lists, font-size, and multi-line paragraphs.
 * Output is sanitized HTML compatible with `lib/richText.ts` so it round-trips safely
 * through Supabase and renders cleanly in PDF exports.
 */
export default function RichTextEditor({
  value,
  onChange,
  placeholder = "Type your notes...",
  minHeight = 160,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [focused, setFocused] = useState(false);
  const sanitizedValue = useMemo(() => sanitizeRichTextHtml(value), [value]);
  const plainValue = useMemo(() => stripRichTextToPlain(value), [value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || focused || editor.innerHTML === sanitizedValue) return;
    editor.innerHTML = sanitizedValue;
  }, [focused, sanitizedValue]);

  const syncEditorValue = () => {
    const editor = editorRef.current;
    if (!editor) return;
    onChange(normalizeEditorHtml(editor.innerHTML));
  };

  const commitEditorValue = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const cleanValue = sanitizeRichTextHtml(editor.innerHTML);
    if (editor.innerHTML !== cleanValue) editor.innerHTML = cleanValue;
    onChange(cleanValue);
  };

  const runCommand = (command: string, commandValue?: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(command, false, commandValue);
    commitEditorValue();
  };

  const handleInput = (_event: FormEvent<HTMLDivElement>) => {
    syncEditorValue();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    document.execCommand(event.shiftKey ? "insertLineBreak" : "insertParagraph");
    requestAnimationFrame(syncEditorValue);
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const pastedText = event.clipboardData.getData("text/plain");
    document.execCommand("insertHTML", false, plainTextToRichTextHtml(pastedText));
    syncEditorValue();
  };

  const toolbarButtons = [
    { label: "Bold", icon: Bold, action: () => runCommand("bold") },
    { label: "Underline", icon: Underline, action: () => runCommand("underline") },
    { label: "Bullets", icon: List, action: () => runCommand("insertUnorderedList") },
    { label: "Numbering", icon: ListOrdered, action: () => runCommand("insertOrderedList") },
    { label: "Small", icon: Type, action: () => runCommand("fontSize", "1") },
    { label: "Normal", icon: Type, action: () => runCommand("fontSize", "3") },
    { label: "Large", icon: Type, action: () => runCommand("fontSize", "4") },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-bg-surface">
      <div className="flex flex-wrap gap-1 border-b border-border bg-bg/40 px-2 py-1.5">
        {toolbarButtons.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                item.action();
              }}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-bg-raised px-2 text-[12px] font-medium text-txt transition hover:border-accent/50 hover:bg-bg-hover hover:text-white"
              title={item.label}
              aria-label={item.label}
            >
              <Icon size={14} strokeWidth={2.25} />
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          );
        })}
      </div>
      <div className="relative">
        {!plainValue && !focused ? (
          <div className="pointer-events-none absolute left-4 top-3 text-sm leading-6 text-txt-dim">
            {placeholder}
          </div>
        ) : null}
        <div
          ref={editorRef}
          role="textbox"
          aria-multiline="true"
          aria-label={placeholder}
          data-placeholder={placeholder}
          contentEditable
          suppressContentEditableWarning
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            commitEditorValue();
          }}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          style={{ minHeight }}
          className="rich-text-editor w-full overflow-y-auto px-4 py-3 text-sm leading-6 text-txt outline-none"
        />
      </div>
    </div>
  );
}
