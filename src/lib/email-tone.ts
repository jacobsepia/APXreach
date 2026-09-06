import { convert } from "html-to-text";
import { sanitizeEmailHtml } from "./email-content";

/*
 * Rewriting a draft in a different tone, without letting the model touch the
 * things a customer would notice were wrong: names, amounts, dates, invoice
 * numbers, addresses, links, and the sender's signature.
 *
 * The signature is never sent to the model at all — the draft is split and
 * only the message above the sign-off is rewritten. Everything else is
 * protected by checking the rewrite AFTER it comes back: every protected
 * value found in the original must appear, verbatim, in the rewrite, or the
 * rewrite is discarded and the person keeps their draft.
 */

import { tones, type Tone } from "./email-tone-list";
export { tones, toneList, isTone, type Tone } from "./email-tone-list";

export class ToneError extends Error {}

/** The plain text a person would read, for matching and for the model. */
export function htmlToPlain(html: string): string {
  return convert(html, { wordwrap: false, selectors: [{ selector: "a", options: { ignoreHref: true } }] }).trim();
}

/**
 * Split the draft at the sign-off. The signature block is the LAST paragraph
 * that names the sender — the composer puts "Best," and the signature in one
 * paragraph, and a name mentioned earlier in the message is not a sign-off.
 * No sender name in the draft means nothing to protect this way; the whole
 * body is the message.
 */
export function splitSignature(bodyHtml: string, senderName: string): { message: string; signature: string } {
  const name = senderName.trim();
  if (!name) return { message: bodyHtml, signature: "" };
  const escaped = name.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
  const at = Math.max(bodyHtml.lastIndexOf(escaped), bodyHtml.lastIndexOf(name));
  if (at < 0) return { message: bodyHtml, signature: "" };
  const start = bodyHtml.lastIndexOf("<p", at);
  if (start < 0) return { message: bodyHtml, signature: "" };
  return { message: bodyHtml.slice(0, start), signature: bodyHtml.slice(start) };
}

const monthNames = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?";
const protectedPatterns: RegExp[] = [
  /\{\{\s*[^{}]+?\s*\}\}/g, // template tags
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, // email addresses
  /https?:\/\/[^\s<>"']+/g, // links
  /\b[A-Z]{3}\s?\d[\d,]*(?:\.\d{2})?\b/g, // CAD 1,250.00
  /[$€£]\s?\d[\d,]*(?:\.\d{2})?/g, // $1,250.00
  /\b\d[\d,]*\.\d{2}\b/g, // 1,250.00
  /\b\d+(?:\.\d+)?%/g, // 15%
  /\b\d{4}-\d{2}-\d{2}\b/g, // 2026-09-30
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, // 30/09/2026
  new RegExp(`\\b${monthNames}\\s\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s\\d{4})?\\b`, "g"), // September 30, 2026
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s${monthNames}(?:,?\\s\\d{4})?\\b`, "g"), // 30 September 2026
  /\b[A-Z]{2,6}[-#]?\d{2,}\b/g, // INV-1042, PO12345
  /#\d{2,}\b/g, // #1042
];

const squash = (value: string) => value.replace(/\s+/g, " ").trim();

/**
 * Everything in the original that must survive a rewrite verbatim. Names are
 * only protected when they actually appear, so a contact whose name the
 * person did not use is not a reason to reject a good rewrite.
 */
export function protectedValues(text: string, names: string[] = []): string[] {
  const flat = squash(text);
  const found = new Set<string>();
  for (const pattern of protectedPatterns) {
    for (const match of flat.matchAll(pattern)) found.add(squash(match[0]));
  }
  for (const name of names) {
    const trimmed = squash(name);
    if (trimmed && flat.includes(trimmed)) found.add(trimmed);
  }
  /* "CAD 1,250.00" already covers "1,250.00"; one entry per fact. */
  const values = [...found];
  return values.filter((value) => !values.some((other) => other !== value && other.includes(value)));
}

/** The protected values that the rewrite lost or altered. */
export function missingFromRewrite(original: string, rewritten: string, names: string[] = []): string[] {
  const flat = squash(rewritten);
  return protectedValues(original, names).filter((value) => !flat.includes(value));
}

export function buildInstructions(tone: Tone, protectedList: string[]): string {
  const keep = protectedList.length
    ? `\n\nThese values appear in the draft and must appear in your rewrite exactly as written, character for character: ${protectedList.map((value) => `"${value}"`).join(", ")}.`
    : "";
  return (
    `You rewrite business email drafts for a small company's CRM. Rewrite the message the user gives you so that it is ${tones[tone].instruction}` +
    "\n\nRules:" +
    "\n- Keep the meaning and every commitment. Add no new facts, offers, deadlines, apologies or promises." +
    "\n- Keep every name, amount, date, invoice number, email address, link, percentage and {{tag}} exactly as written." +
    "\n- Keep the greeting line and the name in it." +
    "\n- Do not add a sign-off, a signature or a subject line. The signature is appended separately." +
    "\n- Keep roughly the same length unless the tone calls for shorter." +
    "\n- Reply with the rewritten message only, as simple HTML using <p>, <br>, <strong>, <em>, <ul>, <ol> and <li>. No markdown, no code fences, no commentary." +
    keep
  );
}

type ResponsesOutput = {
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  error?: { message?: string; code?: string; type?: string };
};

/** The text of a Responses API reply, whatever shape the output items take. */
export function readResponseText(payload: ResponsesOutput): string {
  const parts: string[] = [];
  for (const item of payload.output ?? []) {
    if (item.type !== "message") continue;
    for (const piece of item.content ?? []) {
      if (piece.type === "output_text" && piece.text) parts.push(piece.text);
    }
  }
  return parts.join("\n").trim();
}

/** Models sometimes fence HTML despite instructions; plain text gets paragraphs. */
export function normalizeRewriteHtml(raw: string): string {
  let text = raw.trim();
  const fenced = /^```[a-z]*\s*([\s\S]*?)\s*```$/i.exec(text);
  if (fenced) text = fenced[1].trim();
  if (!/<[a-z][^>]*>/i.test(text)) {
    const escape = (value: string) => value.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]!);
    text = text
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${escape(paragraph).replace(/\n/g, "<br>")}</p>`)
      .join("");
  }
  return sanitizeEmailHtml(text);
}

export type OpenAIOptions = {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
};

/** One call to OpenAI. Every failure becomes a sentence the person can act on, never a stack trace or the key. */
export async function callOpenAI(instructions: string, input: string, options: OpenAIOptions): Promise<string> {
  const doFetch = options.fetchImpl ?? fetch;
  const reasoningModel = /^(?:gpt-5|o\d)/.test(options.model);
  let response: Response;
  try {
    response = await doFetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: options.model,
        instructions,
        input,
        max_output_tokens: 2500,
        store: false,
        ...(reasoningModel ? { reasoning: { effort: "minimal" } } : { temperature: 0.4 }),
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (caught) {
    const timedOut = caught instanceof Error && caught.name === "TimeoutError";
    throw new ToneError(timedOut ? "OpenAI took too long to answer. Your draft is unchanged — try again." : "Reach could not reach OpenAI. Your draft is unchanged — try again in a moment.");
  }

  let payload: ResponsesOutput = {};
  try { payload = (await response.json()) as ResponsesOutput; } catch { /* handled below */ }

  if (!response.ok) {
    const detail = payload.error?.message ?? `HTTP ${response.status}`;
    if (response.status === 401) throw new ToneError("OpenAI rejected the API key. Check OPENAI_API_KEY on the server.");
    if (response.status === 429 && payload.error?.code === "insufficient_quota") {
      throw new ToneError("OpenAI reports no remaining credit on this API key. Add billing at platform.openai.com, then try again.");
    }
    if (response.status === 429) throw new ToneError("OpenAI is busy right now. Your draft is unchanged — try again in a moment.");
    if (response.status === 404 || payload.error?.code === "model_not_found") {
      throw new ToneError(`OpenAI does not offer the model "${options.model}" to this key. Set OPENAI_MODEL to one it does.`);
    }
    throw new ToneError(`OpenAI could not rewrite this draft (${detail}). Your draft is unchanged.`);
  }

  const text = readResponseText(payload);
  if (!text) throw new ToneError("OpenAI returned an empty rewrite. Your draft is unchanged.");
  return text;
}

export type RewriteInput = {
  tone: Tone;
  bodyHtml: string;
  senderName: string;
  /** Names that must survive if they appear: the contact's, the sender's. */
  names: string[];
};

/**
 * The whole rewrite: split off the signature, rewrite the message, check that
 * nothing protected was lost, and put the signature back untouched.
 */
export async function rewriteDraft(input: RewriteInput, options: OpenAIOptions): Promise<{ bodyHtml: string; text: string }> {
  const { message, signature } = splitSignature(input.bodyHtml, input.senderName);
  const originalText = htmlToPlain(message);
  if (!originalText) throw new ToneError("Write a message above your signature first, then pick a tone.");

  const names = [...input.names, input.senderName];
  const keep = protectedValues(originalText, names);
  const raw = await callOpenAI(buildInstructions(input.tone, keep), message, options);
  const rewrittenHtml = normalizeRewriteHtml(raw);
  const rewrittenText = htmlToPlain(rewrittenHtml);
  if (!rewrittenText) throw new ToneError("OpenAI returned an empty rewrite. Your draft is unchanged.");

  const missing = missingFromRewrite(originalText, rewrittenText, names);
  if (missing.length) {
    throw new ToneError(`The rewrite changed ${missing.map((value) => `"${value}"`).join(", ")}, so it was discarded. Your draft is unchanged — try again or pick another tone.`);
  }

  const bodyHtml = rewrittenHtml + signature;
  return { bodyHtml, text: htmlToPlain(bodyHtml) };
}
