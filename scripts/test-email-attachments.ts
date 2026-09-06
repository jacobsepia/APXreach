import assert from "node:assert/strict";
import { test } from "node:test";
import { attachmentProblem, formatBytes, MAX_ATTACHMENT_BYTES } from "../src/lib/email-attachments";
import { buildRfc822 } from "../src/lib/mailbox/providers";

test("sizes read the way a person says them", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(120 * 1024), "120 KB");
  assert.equal(formatBytes(1.5 * 1024 * 1024), "1.5 MB");
});

test("the attachment rules refuse with a reason and accept ordinary documents", () => {
  assert.equal(attachmentProblem([]), null);
  assert.equal(attachmentProblem([{ name: "quote.pdf", size: 200_000 }, { name: "terms.docx", size: 40_000 }]), null);
  assert.match(attachmentProblem(Array.from({ length: 6 }, (_, i) => ({ name: `f${i}.pdf`, size: 10 })))!, /up to 5/);
  assert.match(attachmentProblem([{ name: "setup.exe", size: 10 }])!, /program file/);
  assert.match(attachmentProblem([{ name: "empty.pdf", size: 0 }])!, /empty/);
  assert.match(attachmentProblem([{ name: "big.pdf", size: MAX_ATTACHMENT_BYTES + 1 }])!, /limit is 3\.0 MB/);
  assert.match(attachmentProblem([{ name: "a.pdf", size: 2 * 1024 * 1024 }, { name: "b.pdf", size: 1.5 * 1024 * 1024 }])!, /total 3\.5 MB/);
});

test("an RFC 822 message with files is multipart/mixed around the text/HTML pair", () => {
  const raw = buildRfc822("Jacob <jacob@example.com>", {
    to: "joseph@example.com",
    subject: "Quote",
    text: "See attached.",
    html: "<p>See attached.</p>",
    attachments: [{ filename: 'quote "final".pdf', contentType: "application/pdf", content: Buffer.from("%PDF-1.4 hello") }],
  });
  assert.match(raw, /^Content-Type: multipart\/mixed; boundary="apxreach_mix_/m);
  assert.match(raw, /^Content-Type: multipart\/alternative; boundary="apxreach_alt_/m);
  assert.match(raw, /^Content-Type: text\/plain; charset="UTF-8"\r\n\r\nSee attached\./m);
  assert.match(raw, /^Content-Type: application\/pdf; name="quote _final_\.pdf"/m);
  assert.match(raw, /^Content-Disposition: attachment; filename="quote _final_\.pdf"/m);
  assert.ok(raw.includes(Buffer.from("%PDF-1.4 hello").toString("base64")));
  assert.ok(raw.trimEnd().endsWith("--"), "the mixed boundary closes the message");
});

test("without files the message is unchanged in shape", () => {
  const raw = buildRfc822("jacob@example.com", { to: "joseph@example.com", subject: "Hi", text: "Plain" });
  assert.ok(!raw.includes("multipart/mixed"));
  assert.match(raw, /^Content-Type: text\/plain; charset="UTF-8"\r\n\r\nPlain/m);
});
