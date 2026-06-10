// ------------------------------------------------------------------
// Shared CAD drawing primitives for parametric SVG generators.
//
// Conventions (monochrome, issued-drawing style):
// - Object outlines: black, heavy stroke.
// - Dimension/extension lines: black, thin stroke, filled arrowheads.
// - Hatching is emitted as explicit clipped line segments (NOT <pattern>),
//   because Fabric.js SVG import does not reliably support pattern fills,
//   markers, or defs. Everything here is plain lines/paths/text.
// ------------------------------------------------------------------

export const CAD = {
  ink: "#111827",
  faint: "#475569",
  white: "#ffffff",
  concreteFill: "#f1f5f9",
  thin: 1,
  medium: 1.8,
  thick: 2.8,
  font: "Arial, Helvetica, sans-serif",
  dimText: 11,
  labelText: 11.5,
  titleText: 16,
} as const;

const fmt = (value: number) => {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
};

/** Millimetres shown as integer mm; metres with 2 decimals. */
export const mmLabel = (mm: number) => `${Math.round(mm)}`;
export const mLabel = (mm: number) => (mm / 1000).toFixed(2);

export function svgDoc(width: number, height: number, body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(width)} ${fmt(height)}" fill="none">${body}</svg>`;
}

export function line(
  x1: number, y1: number, x2: number, y2: number,
  strokeWidth: number = CAD.thin, stroke: string = CAD.ink, dash?: string,
) {
  return `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
}

export function rect(
  x: number, y: number, w: number, h: number,
  opts: { fill?: string; strokeWidth?: number; stroke?: string } = {},
) {
  return `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" fill="${opts.fill ?? "none"}" stroke="${opts.stroke ?? CAD.ink}" stroke-width="${opts.strokeWidth ?? CAD.thick}"/>`;
}

export function polygon(
  points: Array<{ x: number; y: number }>,
  opts: { fill?: string; strokeWidth?: number; stroke?: string; close?: boolean } = {},
) {
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${fmt(p.x)} ${fmt(p.y)}`).join(" ") + (opts.close === false ? "" : " Z");
  return `<path d="${d}" fill="${opts.fill ?? "none"}" stroke="${opts.stroke ?? CAD.ink}" stroke-width="${opts.strokeWidth ?? CAD.thick}" stroke-linejoin="round"/>`;
}

export function circle(
  cx: number, cy: number, r: number,
  opts: { fill?: string; strokeWidth?: number; stroke?: string } = {},
) {
  return `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r)}" fill="${opts.fill ?? "none"}" stroke="${opts.stroke ?? CAD.ink}" stroke-width="${opts.strokeWidth ?? CAD.medium}"/>`;
}

export function text(
  x: number, y: number, value: string,
  opts: { size?: number; bold?: boolean; anchor?: "start" | "middle" | "end"; angle?: number; color?: string } = {},
) {
  const transform = opts.angle ? ` transform="rotate(${opts.angle} ${fmt(x)} ${fmt(y)})"` : "";
  return `<text x="${fmt(x)}" y="${fmt(y)}" text-anchor="${opts.anchor ?? "middle"}" font-family="${CAD.font}" font-size="${opts.size ?? CAD.labelText}"${opts.bold ? ` font-weight="700"` : ""} fill="${opts.color ?? CAD.ink}"${transform}>${value}</text>`;
}

// ------------------------------------------------------------------
// Arrowheads — filled triangles (no <marker>, fabric-safe).
// ------------------------------------------------------------------
function arrow(x: number, y: number, angleDeg: number, size = 9) {
  const a = (angleDeg * Math.PI) / 180;
  const back = size;
  const half = size * 0.22;
  const bx = x - Math.cos(a) * back;
  const by = y - Math.sin(a) * back;
  const px = -Math.sin(a) * half;
  const py = Math.cos(a) * half;
  return `<path d="M${fmt(x)} ${fmt(y)} L${fmt(bx + px)} ${fmt(by + py)} L${fmt(bx - px)} ${fmt(by - py)} Z" fill="${CAD.ink}"/>`;
}

// ------------------------------------------------------------------
// Dimensions. Geometry points (x1..)/(y1..) are on the object;
// the dimension line is drawn offset away, with extension lines,
// arrowheads pointing outward and the value centred on the line.
// ------------------------------------------------------------------
export function dimH(
  x1: number, x2: number, yObj: number, yDim: number, label: string,
  opts: { textAbove?: boolean; size?: number } = {},
) {
  const lo = Math.min(x1, x2);
  const hi = Math.max(x1, x2);
  const dir = yDim < yObj ? -1 : 1;
  const textY = (opts.textAbove ?? true) ? yDim - 4 : yDim + 13;
  return [
    line(lo, yObj + dir * 3, lo, yDim + dir * 4),
    line(hi, yObj + dir * 3, hi, yDim + dir * 4),
    line(lo, yDim, hi, yDim),
    arrow(lo, yDim, 180),
    arrow(hi, yDim, 0),
    text((lo + hi) / 2, textY, label, { size: opts.size ?? CAD.dimText }),
  ].join("");
}

export function dimV(
  y1: number, y2: number, xObj: number, xDim: number, label: string,
  opts: { size?: number } = {},
) {
  const lo = Math.min(y1, y2);
  const hi = Math.max(y1, y2);
  const dir = xDim < xObj ? -1 : 1;
  return [
    line(xObj + dir * 3, lo, xDim + dir * 4, lo),
    line(xObj + dir * 3, hi, xDim + dir * 4, hi),
    line(xDim, lo, xDim, hi),
    arrow(xDim, lo, 270),
    arrow(xDim, hi, 90),
    text(xDim - 4, (lo + hi) / 2, label, { size: opts.size ?? CAD.dimText, angle: -90 }),
  ].join("");
}

/** Leader note: short line with arrow at target, horizontal landing, text. */
export function leader(
  tx: number, ty: number, lx: number, ly: number, value: string | string[],
  opts: { anchor?: "start" | "end"; size?: number } = {},
) {
  const anchor = opts.anchor ?? (lx >= tx ? "start" : "end");
  const landing = anchor === "start" ? lx + 14 : lx - 14;
  const angle = (Math.atan2(ty - ly, tx - lx) * 180) / Math.PI;
  const lines = Array.isArray(value) ? value : [value];
  const textX = anchor === "start" ? landing + 3 : landing - 3;
  const texts = lines
    .map((entry, index) => text(textX, ly - 3 + index * 13, entry, { size: opts.size ?? CAD.dimText, anchor }))
    .join("");
  return [
    line(tx, ty, lx, ly),
    line(lx, ly, landing, ly),
    arrow(tx, ty, angle, 8),
    texts,
  ].join("");
}

// ------------------------------------------------------------------
// Hatching — explicit 45° segments clipped analytically to a rect.
// ------------------------------------------------------------------
export function hatchRect(
  x: number, y: number, w: number, h: number,
  opts: { spacing?: number; strokeWidth?: number; stroke?: string } = {},
) {
  const spacing = opts.spacing ?? 9;
  const sw = opts.strokeWidth ?? 0.9;
  const stroke = opts.stroke ?? CAD.faint;
  const parts: string[] = [];
  // Lines of form X + Y = c, c from (x+y) to (x+w+y+h)
  for (let c = x + y + spacing; c < x + w + (y + h); c += spacing) {
    // Intersect with rect borders
    let px1 = c - (y + h);
    let py1 = y + h;
    if (px1 < x) { px1 = x; py1 = c - x; }
    let px2 = c - y;
    let py2 = y;
    if (px2 > x + w) { px2 = x + w; py2 = c - (x + w); }
    if (px1 <= x + w && py2 <= y + h) parts.push(line(px1, py1, px2, py2, sw, stroke));
  }
  return parts.join("");
}

/** Concrete: 45° hatch plus sparse aggregate dots, deterministic layout. */
export function concreteHatchRect(x: number, y: number, w: number, h: number, spacing = 11) {
  const dots: string[] = [];
  const step = spacing * 2.6;
  let row = 0;
  for (let yy = y + step / 2; yy < y + h - 2; yy += step) {
    const shift = (row % 2) * step * 0.5;
    for (let xx = x + step / 2 + shift; xx < x + w - 2; xx += step) {
      dots.push(`<circle cx="${fmt(xx)}" cy="${fmt(yy)}" r="1.1" fill="${CAD.faint}"/>`);
    }
    row += 1;
  }
  return hatchRect(x, y, w, h, { spacing }) + dots.join("");
}

/**
 * Earth symbol: short 45° ticks hatched on the soil side of a line.
 * Pass any straight segment; ticks are drawn perpendicular-ish (45°)
 * on the right-hand side of p1->p2 travel direction.
 */
export function earthTicks(
  p1: { x: number; y: number }, p2: { x: number; y: number },
  opts: { spacing?: number; length?: number } = {},
) {
  const spacing = opts.spacing ?? 12;
  const len = opts.length ?? 9;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const segLen = Math.hypot(dx, dy);
  if (segLen < spacing) return "";
  const ux = dx / segLen;
  const uy = dy / segLen;
  // tick direction: rotate direction vector by +135° (back and to the right)
  const tx = (-ux + -uy) * Math.SQRT1_2;
  const ty = (ux + -uy) * Math.SQRT1_2;
  const parts: string[] = [];
  for (let d = spacing * 0.6; d < segLen; d += spacing) {
    const bx = p1.x + ux * d;
    const by = p1.y + uy * d;
    parts.push(line(bx, by, bx - tx * len, by - ty * len, 0.9, CAD.faint));
  }
  return parts.join("");
}

/** Granular / gravel fill: deterministic small open circles in a rect. */
export function gravelRect(x: number, y: number, w: number, h: number, step = 13) {
  const parts: string[] = [];
  let row = 0;
  for (let yy = y + step / 2; yy < y + h - 3; yy += step) {
    const shift = (row % 2) * step * 0.5;
    for (let xx = x + step / 2 + shift; xx < x + w - 3; xx += step) {
      const r = 1.6 + ((row + Math.round(xx)) % 3) * 0.5;
      parts.push(`<circle cx="${fmt(xx)}" cy="${fmt(yy)}" r="${fmt(r)}" stroke="${CAD.faint}" stroke-width="0.8" fill="none"/>`);
    }
    row += 1;
  }
  return parts.join("");
}

/** Centre line: long-dash-short-dash convention. */
export function centerline(x1: number, y1: number, x2: number, y2: number, strokeWidth = 1) {
  return line(x1, y1, x2, y2, strokeWidth, CAD.ink, "16 5 4 5");
}

/** Break line (zig) across a vertical edge at x between y1..y2. */
export function breakLineV(x: number, y1: number, y2: number) {
  const midY = (y1 + y2) / 2;
  return `<path d="M${fmt(x)} ${fmt(y1)} L${fmt(x)} ${fmt(midY - 8)} L${fmt(x - 6)} ${fmt(midY - 3)} L${fmt(x + 6)} ${fmt(midY + 3)} L${fmt(x)} ${fmt(midY + 8)} L${fmt(x)} ${fmt(y2)}" stroke="${CAD.ink}" stroke-width="${CAD.thin}" fill="none"/>`;
}

/** Rebar in section: filled dot with thin halo. */
export function barDot(cx: number, cy: number, dia: number) {
  const r = Math.max(dia * 0.28, 3);
  return `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r)}" fill="${CAD.ink}"/>`;
}

/** Slope indicator: small right triangle annotation like 1:n. */
export function slopeMark(x: number, y: number, run: number, rise: number, label: string) {
  return [
    line(x, y, x + run, y),
    line(x + run, y, x + run, y - rise),
    line(x, y, x + run, y - rise, 0.9),
    text(x + run / 2, y + 13, label, { size: 10.5 }),
  ].join("");
}

/** Drawing title with double underline + optional scale note. */
export function drawingTitle(cx: number, y: number, title: string, sub?: string) {
  const width = Math.max(title.length * 9.2, 120);
  return [
    text(cx, y, title, { size: CAD.titleText, bold: true }),
    line(cx - width / 2, y + 7, cx + width / 2, y + 7, 1.6),
    line(cx - width / 2, y + 10, cx + width / 2, y + 10, 0.8),
    sub ? text(cx, y + 25, sub, { size: 11 }) : "",
  ].join("");
}

/** Existing-ground line: dash-dot faint. */
export function groundLine(x1: number, y1: number, x2: number, y2: number) {
  return line(x1, y1, x2, y2, 1.1, CAD.ink, "10 4 2 4");
}

/** Water level symbol: inverted triangle + short rules. */
export function waterLevel(x: number, y: number) {
  return [
    `<path d="M${fmt(x - 7)} ${fmt(y - 8)} L${fmt(x + 7)} ${fmt(y - 8)} L${fmt(x)} ${fmt(y)} Z" fill="none" stroke="${CAD.ink}" stroke-width="1"/>`,
    line(x - 6, y + 3, x + 6, y + 3, 1),
    line(x - 3.5, y + 6, x + 3.5, y + 6, 1),
  ].join("");
}
