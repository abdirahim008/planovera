// Downscale + recompress uploaded images before they enter the store.
//
// Photos, logos and signatures were being stored as raw base64 data-URLs (often
// 2–5 MB each). Persisted into one localStorage key that has a ~5 MB quota, a
// couple of photos silently broke persistence; they also bloated every sync
// payload. This shrinks an upload to a bounded size (typically 10–40× smaller)
// while staying a plain data-URL, so nothing else about how images are stored,
// rendered or exported has to change.
//
// It preserves PNG (alpha) for PNG input, leaves SVG untouched (vector), and
// falls back to the original bytes on any failure — so it can never make an
// upload worse or throw.

export interface CompressOptions {
  /** Longest edge, in px, the image is scaled down to. */
  maxDimension?: number;
  /** JPEG quality (0–1) for non-PNG inputs. */
  quality?: number;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Unable to decode image"));
    img.src = src;
  });
}

export async function compressImageFile(file: File, opts: CompressOptions = {}): Promise<string> {
  const { maxDimension = 1600, quality = 0.82 } = opts;
  const original = await readAsDataUrl(file);

  // Non-images and vector SVGs are left as-is (SVGs are tiny and rasterizing
  // them would lose quality). Also bail if we're not in a DOM (SSR safety).
  if (
    typeof document === "undefined" ||
    !file.type.startsWith("image/") ||
    file.type === "image/svg+xml"
  ) {
    return original;
  }

  try {
    const img = await loadImage(original);
    const longest = Math.max(img.width, img.height) || 1;
    const scale = Math.min(1, maxDimension / longest);

    // Already small in both dimensions and bytes — keep the original.
    if (scale === 1 && file.size < 200 * 1024) return original;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Preserve alpha for PNG uploads; use JPEG for photos/other raster formats.
    const type = file.type === "image/png" ? "image/png" : "image/jpeg";
    const out = canvas.toDataURL(type, type === "image/jpeg" ? quality : undefined);

    // Only adopt the result if it actually got smaller.
    return out && out.length > 0 && out.length < original.length ? out : original;
  } catch {
    return original;
  }
}
