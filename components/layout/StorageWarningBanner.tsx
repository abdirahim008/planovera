"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

// Shows a dismissible banner when the persisted store fails to write to
// localStorage (quota exceeded). Without this the failure was silent and users
// could lose recent local changes without any indication. The store dispatches
// a "planovera:storage-error" window event on a failed write.
export default function StorageWarningBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onError = () => setVisible(true);
    window.addEventListener("planovera:storage-error", onError);
    return () => window.removeEventListener("planovera:storage-error", onError);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[1000] flex justify-center px-3 pt-3">
      <div className="flex w-full max-w-2xl items-start gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 shadow-lg backdrop-blur">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warn" />
        <div className="min-w-0 flex-1 text-[13px] leading-6 text-txt">
          <span className="font-semibold">This device is running low on local storage.</span>{" "}
          Recent changes may not be saved on this device — large images are the usual cause. Your
          work is preserved in your account when you&apos;re online; consider removing or replacing
          large photos/logos.
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Dismiss"
          className="shrink-0 rounded-lg p-1 text-txt-muted transition hover:bg-bg-hover hover:text-txt"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
