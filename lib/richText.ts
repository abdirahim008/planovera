const FONT_SIZE_MAP: Record<string, string> = {
  "1": "12px",
  "2": "14px",
  "3": "16px",
  "4": "18px",
  small: "12px",
  normal: "16px",
  large: "18px",
};

const APPROVED_FONT_SIZES = new Set(Object.values(FONT_SIZE_MAP));

export function escapeRichText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function looksLikeHtml(value: string) {
  return /<\/?(p|br|ul|ol|li|strong|b|u|span|div|font)\b/i.test(value);
}

export function plainTextToRichTextHtml(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  return trimmed
    .split(/\n{2,}/)
    .map((paragraph) => {
      const lines = paragraph.split(/\n/).map((line) => escapeRichText(line.trim())).filter(Boolean);
      return lines.length > 0 ? `<p>${lines.join("<br>")}</p>` : "";
    })
    .filter(Boolean)
    .join("");
}

export function normalizeEditorHtml(value: string) {
  return value
    .replace(/<font\b[^>]*size=["']?([1-4])["']?[^>]*>/gi, (_, size: string) => {
      const mapped = FONT_SIZE_MAP[size] || FONT_SIZE_MAP.normal;
      return `<span style="font-size:${mapped}">`;
    })
    .replace(/<\/font>/gi, "</span>")
    .replace(/<b(\s[^>]*)?>/gi, "<strong>")
    .replace(/<\/b>/gi, "</strong>")
    .replace(/<div(\s[^>]*)?>/gi, "<p>")
    .replace(/<\/div>/gi, "</p>");
}

export function sanitizeRichTextHtml(value: string) {
  const source = looksLikeHtml(value) ? value : plainTextToRichTextHtml(value);
  const normalized = normalizeEditorHtml(source)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  return normalized
    .replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (match, rawTag: string, rawAttributes: string) => {
      const tag = rawTag.toLowerCase();
      const closing = /^<\//.test(match);

      if (["p", "br", "ul", "ol", "li", "strong", "u"].includes(tag)) {
        return closing ? `</${tag}>` : `<${tag}>`;
      }

      if (tag === "span") {
        if (closing) return "</span>";
        const fontSizeMatch = rawAttributes.match(/font-size\s*:\s*(12px|14px|16px|18px)/i);
        const fontSize = fontSizeMatch?.[1]?.toLowerCase();
        return fontSize && APPROVED_FONT_SIZES.has(fontSize)
          ? `<span style="font-size:${fontSize}">`
          : "<span>";
      }

      return "";
    })
    .replace(/\s+on[a-z]+=(["']).*?\1/gi, "")
    .replace(/<p>\s*<\/p>/gi, "")
    .trim();
}

export function stripRichTextToPlain(value: string) {
  const html = sanitizeRichTextHtml(value);
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol)>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}
