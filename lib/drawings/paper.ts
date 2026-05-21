// ------------------------------------------------------------------
// Paper sizes — millimetres to CSS pixels at 96 DPI
// ------------------------------------------------------------------

export type PaperSizeKey = "a4" | "a3" | "a2" | "letter" | "legal" | "tabloid";
export type Orientation = "portrait" | "landscape";

export const MM_PER_INCH = 25.4;
export const DPI = 96;
export const PX_PER_MM = DPI / MM_PER_INCH; // ~3.7795

export const PAPER_SIZES: Record<
  PaperSizeKey,
  { label: string; mmWidth: number; mmHeight: number }
> = {
  a4:      { label: "A4",      mmWidth: 210, mmHeight: 297 },
  a3:      { label: "A3",      mmWidth: 297, mmHeight: 420 },
  a2:      { label: "A2",      mmWidth: 420, mmHeight: 594 },
  letter:  { label: "Letter",  mmWidth: 216, mmHeight: 279 },
  legal:   { label: "Legal",   mmWidth: 216, mmHeight: 356 },
  tabloid: { label: "Tabloid", mmWidth: 279, mmHeight: 432 },
};

export function mmToPx(mm: number): number {
  return Math.round(mm * PX_PER_MM);
}

export interface PaperDims {
  mmWidth: number;   // paper width in mm (oriented)
  mmHeight: number;  // paper height in mm (oriented)
  width: number;     // canvas width in pixels
  height: number;    // canvas height in pixels
}

export function getPaperDimensions(
  size: PaperSizeKey,
  orientation: Orientation
): PaperDims {
  const p = PAPER_SIZES[size];
  const landscape = orientation === "landscape";
  const mmW = landscape ? p.mmHeight : p.mmWidth;
  const mmH = landscape ? p.mmWidth  : p.mmHeight;
  return {
    mmWidth: mmW,
    mmHeight: mmH,
    width: mmToPx(mmW),
    height: mmToPx(mmH),
  };
}
