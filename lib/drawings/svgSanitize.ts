// ------------------------------------------------------------------
// Minimal SVG sanitizer for pasted/uploaded markup.
// Strips scripting vectors before markup is rendered to the canvas or
// published to the shared library. This is a defence-in-depth measure:
// the markup is parsed by Fabric.js (not injected into the DOM), but
// library SVG is also previewed via data URIs in the UI.
// ------------------------------------------------------------------

export function sanitizeSvgMarkup(svg: string): string {
  let clean = svg;

  // Remove script/foreignObject blocks entirely (including content).
  clean = clean.replace(/<script[\s\S]*?<\/script\s*>/gi, "");
  clean = clean.replace(/<script[^>]*\/>/gi, "");
  clean = clean.replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "");

  // Remove inline event handlers (onload, onclick, ...).
  clean = clean.replace(/\son\w+\s*=\s*"[^"]*"/gi, "");
  clean = clean.replace(/\son\w+\s*=\s*'[^']*'/gi, "");

  // Neutralise javascript: / data:text URLs in href/xlink:href.
  clean = clean.replace(
    /\s(href|xlink:href)\s*=\s*(["'])\s*(javascript:|data:text)[^"']*\2/gi,
    "",
  );

  return clean.trim();
}

export function looksLikeSvg(markup: string): boolean {
  return /<svg[\s>]/i.test(markup);
}
