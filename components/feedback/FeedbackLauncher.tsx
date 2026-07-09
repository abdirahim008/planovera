"use client";

import clsx from "clsx";
import { Loader2, MessageSquarePlus, Star } from "lucide-react";
import { useEffect, useState } from "react";

import Modal from "@/components/ui/Modal";
import {
  OPEN_FEEDBACK_EVENT,
  submitFeedback,
  type FeedbackCategory,
} from "@/lib/feedback";
import { useAppStore } from "@/lib/store";

const CATEGORIES: Array<{ id: FeedbackCategory; label: string }> = [
  { id: "problem", label: "Something's not working" },
  { id: "idea", label: "Suggestion" },
  { id: "other", label: "Other" },
];

/**
 * "Send feedback" — the sidebar entry plus the modal itself. Other surfaces
 * (the assistant panel) open the same modal by dispatching
 * OPEN_FEEDBACK_EVENT, so there is exactly one form in the tree.
 */
export default function FeedbackLauncher({ collapsed = false }: { collapsed?: boolean }) {
  const activeModule = useAppStore((state) => state.activeModule);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [category, setCategory] = useState<FeedbackCategory>("problem");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_FEEDBACK_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_FEEDBACK_EVENT, onOpen);
  }, []);

  const reset = () => {
    setRating(null);
    setCategory("problem");
    setMessage("");
    setResult(null);
    setSending(false);
  };

  const handleSubmit = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    const { error } = await submitFeedback({ rating, category, message, module: activeModule });
    setSending(false);
    setResult(
      error
        ? { ok: false, text: error }
        : { ok: true, text: "Thank you — your feedback was sent to the Planovera team." },
    );
    if (!error) {
      setRating(null);
      setMessage("");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className={clsx(
          "mb-1 flex w-full items-center rounded-lg text-[13px] font-medium text-txt-muted transition-colors duration-150 hover:bg-bg-hover hover:text-txt",
          collapsed ? "justify-center p-2.5" : "gap-2.5 px-3 py-2",
        )}
        title={collapsed ? "Send feedback" : undefined}
      >
        <MessageSquarePlus size={16} />
        {!collapsed ? <span>Send feedback</span> : null}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Send feedback" width={460}>
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-txt-muted">
              How was your experience? (optional)
            </p>
            <div className="mt-1.5 flex gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(rating === value ? null : value)}
                  aria-label={`${value} star${value === 1 ? "" : "s"}`}
                  className="p-1"
                >
                  <Star
                    size={22}
                    className={
                      rating !== null && value <= rating
                        ? "fill-amber-400 text-amber-400"
                        : "text-txt-dim"
                    }
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-txt-muted">Type</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {CATEGORIES.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCategory(id)}
                  className={clsx(
                    "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                    category === id
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-txt-muted hover:text-txt",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-txt-muted">
              Tell us more
            </p>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="What happened, or what would make Planovera better for you?"
              className="mt-1.5 min-h-[110px] w-full resize-y rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-txt outline-none focus:border-accent/60"
            />
            <p className="mt-1 text-[11px] text-txt-dim">
              Your account email and the module you're in are attached automatically so we can
              follow up.
            </p>
          </div>

          {result ? (
            <p
              className={clsx(
                "rounded-lg px-3 py-2 text-xs",
                result.ok
                  ? "border border-ok/30 bg-ok/10 text-ok"
                  : "border border-err/30 bg-err/10 text-err",
              )}
            >
              {result.text}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-txt-muted transition hover:text-txt"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!message.trim() || sending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white transition hover:bg-accent-strong disabled:opacity-50"
            >
              {sending ? <Loader2 size={13} className="animate-spin" /> : null}
              Send feedback
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
