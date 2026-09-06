import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildInstructions,
  callOpenAI,
  htmlToPlain,
  missingFromRewrite,
  normalizeRewriteHtml,
  protectedValues,
  readResponseText,
  rewriteDraft,
  splitSignature,
  ToneError,
  toneList,
} from "../src/lib/email-tone";
import { emailSignature } from "../src/lib/email-signature";

const signature = emailSignature("Jacob Sepia", "APX Solutions", "jacob@apxsolutions.ca");
const draft = `<p>Hi Joseph,</p><p>Invoice INV-1042 for CAD 1,250.00 was due September 30, 2026 and is still open. Could you let me know when we can expect payment?</p><p>Best,<br>${signature.html}</p>`;

const fakeFetch = (reply: string | { status: number; body: unknown }): typeof fetch =>
  (async () => {
    if (typeof reply === "string") {
      return new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: reply }] }] }), { status: 200 });
    }
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  }) as unknown as typeof fetch;

test("four tones, each with a label and a hint", () => {
  assert.deepEqual(toneList, ["professional", "friendly", "direct", "empathetic"]);
});

test("the signature paragraph is split off and never sent", () => {
  const { message, signature: block } = splitSignature(draft, "Jacob Sepia");
  assert.ok(message.includes("INV-1042"));
  assert.ok(!message.includes("Jacob Sepia"));
  assert.ok(block.startsWith("<p>Best,<br>"));
  assert.ok(block.includes("jacob@apxsolutions.ca"));
  // No sender name in the draft: nothing to split, the whole body is the message.
  assert.deepEqual(splitSignature("<p>Hello</p>", "Jacob Sepia"), { message: "<p>Hello</p>", signature: "" });
  // A mention of the sender inside the message is not the sign-off; the LAST paragraph naming them is.
  const mentioned = `<p>Jacob Sepia asked me to follow up.</p><p>Best,<br>${signature.html}</p>`;
  assert.equal(splitSignature(mentioned, "Jacob Sepia").message, "<p>Jacob Sepia asked me to follow up.</p>");
});

test("names, amounts, dates and invoice numbers are protected", () => {
  const values = protectedValues(htmlToPlain(splitSignature(draft, "Jacob Sepia").message), ["Joseph Sepia", "Joseph"]);
  assert.ok(values.includes("INV-1042"));
  assert.ok(values.includes("CAD 1,250.00"));
  assert.ok(values.includes("September 30, 2026"));
  assert.ok(values.includes("Joseph"));
  assert.ok(!values.includes("Joseph Sepia"), "a name that is not in the draft is not protected");
  assert.deepEqual(protectedValues("Please pay $2,000 by 2026-10-01 or reply to billing@example.com about {{invoice_number}} (15% late fee)."),
    ["{{invoice_number}}", "billing@example.com", "$2,000", "15%", "2026-10-01"]);
});

test("a rewrite that alters a protected value is caught", () => {
  const original = "Invoice INV-1042 for CAD 1,250.00 is due September 30, 2026.";
  assert.deepEqual(missingFromRewrite(original, "Invoice INV-1042 for CAD 1,250.00 is due September 30, 2026 — thanks!"), []);
  assert.deepEqual(missingFromRewrite(original, "Invoice INV-1042 for CAD 1,250 is due September 30, 2026."), ["CAD 1,250.00"]);
  assert.deepEqual(missingFromRewrite(original, "Invoice INV-1043 for CAD 1,250.00 is due October 1, 2026.").sort(), ["INV-1042", "September 30, 2026"]);
});

test("instructions name the tone and the values to keep", () => {
  const text = buildInstructions("empathetic", ["INV-1042", "Joseph"]);
  assert.ok(text.includes("considerate and understanding"));
  assert.ok(text.includes('"INV-1042", "Joseph"'));
  assert.ok(text.includes("Do not add a sign-off"));
});

test("model output is read from the response and normalized to safe HTML", () => {
  assert.equal(readResponseText({ output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text: "<p>Hi</p>" }] }] }), "<p>Hi</p>");
  assert.equal(normalizeRewriteHtml("```html\n<p>Hi <script>x</script>there</p>\n```"), "<p>Hi there</p>");
  assert.equal(normalizeRewriteHtml("Hi Joseph,\n\nJust checking in.\nThanks."), "<p>Hi Joseph,</p><p>Just checking in.<br />Thanks.</p>");
});

test("a full rewrite keeps the signature and protected details intact", async () => {
  const rewritten = "<p>Hi Joseph,</p><p>Invoice INV-1042 (CAD 1,250.00) was due September 30, 2026 and remains open. When can we expect payment?</p>";
  const result = await rewriteDraft(
    { tone: "direct", bodyHtml: draft, senderName: "Jacob Sepia", names: ["Joseph Sepia", "Joseph"] },
    { apiKey: "test", model: "gpt-4.1-mini", fetchImpl: fakeFetch(rewritten) },
  );
  assert.ok(result.bodyHtml.startsWith("<p>Hi Joseph,</p>"));
  assert.ok(result.bodyHtml.endsWith(`<p>Best,<br>${signature.html}</p>`), "signature block is appended untouched");
  assert.ok(result.text.endsWith("Jacob Sepia\nAPX Solutions\njacob@apxsolutions.ca"));
  assert.equal(result.bodyHtml.split("Jacob Sepia").length - 1, 1, "exactly one signature");
});

test("a rewrite that drops the amount is discarded with a reason", async () => {
  await assert.rejects(
    rewriteDraft(
      { tone: "friendly", bodyHtml: draft, senderName: "Jacob Sepia", names: ["Joseph"] },
      { apiKey: "test", model: "gpt-4.1-mini", fetchImpl: fakeFetch("<p>Hi Joseph,</p><p>Your invoice INV-1042 is a little overdue — no rush!</p>") },
    ),
    (error: unknown) => error instanceof ToneError && /"CAD 1,250\.00"/.test(error.message) && /unchanged/.test(error.message),
  );
});

test("a signature-only draft is refused before any call is made", async () => {
  let called = false;
  const spy = (async () => { called = true; return new Response("{}"); }) as unknown as typeof fetch;
  await assert.rejects(
    rewriteDraft({ tone: "professional", bodyHtml: `<p></p><p>Best,<br>${signature.html}</p>`, senderName: "Jacob Sepia", names: [] }, { apiKey: "test", model: "m", fetchImpl: spy }),
    ToneError,
  );
  assert.equal(called, false);
});

test("OpenAI failures become plain sentences without the key", async () => {
  const key = "sk-secret-value";
  for (const [status, body, expect] of [
    [401, { error: { message: "Incorrect API key provided" } }, /rejected the API key/],
    [429, { error: { code: "insufficient_quota", message: "You exceeded your current quota" } }, /no remaining credit/],
    [429, { error: { message: "Rate limit" } }, /busy right now/],
    [404, { error: { code: "model_not_found", message: "The model does not exist" } }, /OPENAI_MODEL/],
    [500, { error: { message: "Server exploded" } }, /Server exploded/],
  ] as const) {
    await assert.rejects(
      callOpenAI("i", "x", { apiKey: key, model: "gpt-4.1-mini", fetchImpl: fakeFetch({ status, body }) }),
      (error: unknown) => error instanceof ToneError && expect.test(error.message) && !error.message.includes(key),
    );
  }
});
