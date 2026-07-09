"use client";

import { useEffect, useRef, useState } from "react";

// Rasterized thumbnails are cached across renders (and across the panel strip /
// warehouse overlay) so scrolling never re-rasterizes the same drawing.
const thumbnailCache = new Map<string, string>();

// Library drawing titles are sometimes prefixed "Standard Details" — strip that
// boilerplate for display so the card shows the actual subject of the drawing.
// The full name is kept for the tooltip and search.
export const displayLibraryName = (name: string) =>
  name.replace(/^\s*standard details\s*[,:–-]?\s*/i, "").trim() || name;

/**
 * Library card thumbnail. Imported CAD drawings can be large SVGs (hundreds of
 * KB each); rendering all of them inline as data-URI <img>s makes the library
 * heavy. This defers work until the card scrolls into view, then rasterizes the
 * SVG once to a small PNG and caches it — so the DOM only ever holds tiny
 * thumbnails for the cards you actually look at.
 */
export function LibraryThumbnail({
  id,
  svg,
  thumbnail,
  alt,
  className = "mt-3 flex h-28 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-white p-1.5",
}: {
  id: string;
  svg: string;
  thumbnail?: string;
  alt: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // A stored thumbnail (admin/DB items) is used directly — no rasterization and
  // no need for the full svg. Seed/local items fall back to rasterizing their svg.
  const [thumb, setThumb] = useState<string | null>(() => thumbnail || thumbnailCache.get(id) || null);
  const [visible, setVisible] = useState(false);

  // Thumbnails STREAM in per-batch after the list renders (the list query is
  // metadata-only), so the prop usually arrives after mount — adopt it, or the
  // card stays blank forever.
  useEffect(() => {
    if (thumbnail) setThumb((current) => current ?? thumbnail);
  }, [thumbnail]);

  useEffect(() => {
    if (thumb || !svg) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "250px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [thumb, svg]);

  useEffect(() => {
    if (!visible || thumb) return;
    let cancelled = false;
    const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const maxW = 260;
      const natW = img.naturalWidth || maxW;
      const natH = img.naturalHeight || maxW;
      const scale = Math.min(1, maxW / natW);
      const w = Math.max(1, Math.round(natW * scale));
      const h = Math.max(1, Math.round(natH * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setThumb(url);
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      let out = url;
      try {
        out = canvas.toDataURL("image/png");
      } catch {
        out = url;
      }
      thumbnailCache.set(id, out);
      setThumb(out);
    };
    img.onerror = () => {
      if (!cancelled) setThumb(url);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [visible, thumb, svg, id]);

  return (
    <div ref={ref} className={className}>
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt={alt} className="max-h-full max-w-full" />
      ) : (
        <div className="h-full w-full animate-pulse rounded-lg bg-slate-50" />
      )}
    </div>
  );
}
