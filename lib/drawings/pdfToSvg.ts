// Browser-only conversion of a vector PDF page into an SVG string, using
// pdf.js's SVG back-end (kept available in the v3 "legacy" build — it was
// removed in pdf.js v4). Only true vector PDFs (e.g. exported from CAD) convert
// to editable geometry; a scanned/raster PDF has no vectors to extract.
//
// Import this dynamically from a client handler so pdf.js (which needs browser
// DOM APIs) is never evaluated during SSR.

export interface PdfToSvgResult {
  svg: string;
  pageCount: number;
  page: number;
}

export async function pdfToSvg(data: ArrayBuffer, pageNumber = 1): Promise<PdfToSvgResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf");

  // The worker is loaded from a version-matched CDN build, which avoids wiring a
  // bundled worker asset through the Next/webpack pipeline.
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
  }

  const pdf = await pdfjs.getDocument({ data }).promise;
  const pageCount: number = pdf.numPages;
  const page = Math.min(Math.max(Math.round(pageNumber) || 1, 1), pageCount);

  const pdfPage = await pdf.getPage(page);
  const viewport = pdfPage.getViewport({ scale: 1 });
  const operatorList = await pdfPage.getOperatorList();

  const svgGfx = new pdfjs.SVGGraphics(pdfPage.commonObjs, pdfPage.objs);
  svgGfx.embedFonts = true;
  const svgElement: SVGElement = await svgGfx.getSVG(operatorList, viewport);

  const svg = new XMLSerializer().serializeToString(svgElement);
  return { svg, pageCount, page };
}
