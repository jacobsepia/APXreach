import sanitizeHtml from "sanitize-html";
import { convert } from "html-to-text";

/** Shared server-side boundary for both sending and displaying rich email. */
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "span", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "blockquote", "a"],
    allowedAttributes: { span: ["style"], p: ["style"], a: ["href", "title"] },
    allowedSchemes: ["https", "http", "mailto"],
    allowProtocolRelative: false,
    allowedStyles: {
      "*": {
        "font-family": [/^(?:Arial|Verdana|Georgia|Tahoma|Times New Roman|Courier New|"Times New Roman"|"Courier New"|'Times New Roman'|'Courier New')$/i],
        "font-size": [/^(?:10|12|14|16|18|20|24|28|32)px$/],
        "text-align": [/^(?:left|center|right)$/],
      },
    },
  });
}

export function prepareEmailBody(text: string, rawHtml?: string | null) {
  if (text.length > 100_000 || (rawHtml?.length ?? 0) > 200_000) throw new Error("This email is too long.");
  const clean = rawHtml ? sanitizeEmailHtml(rawHtml) : null;
  const plain = clean === null ? text.trim() : convert(clean, { wordwrap: false, selectors: [{ selector: "a", options: { ignoreHref: true } }] }).trim();
  if (!plain.replace(/[\s\u200B-\u200D\uFEFF]/g, "")) throw new Error("Write something first.");
  // Inline defaults are understood by email clients that do not load stylesheets.
  return { text: plain, html: clean === null ? undefined : `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#302b36">${clean}</div>` };
}
