import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareEmailBody, sanitizeEmailHtml } from "../src/lib/email-content";
import { buildRfc822, zohoMailbox, microsoftMailbox, googleMailbox } from "../src/lib/mailbox/providers";

const rich = '<p style="text-align:center"><span style="font-family:&quot;Times New Roman&quot;;font-size:20px"><strong>Hello</strong> <em>Joseph</em> <u>again</u></span></p><ul><li><p>First item</p></li></ul>';

test("preserves supported email formatting and readable text", () => {
  const body = prepareEmailBody("untrusted alternate text", rich);
  assert.match(body.html!, /font-family:&quot;Times New Roman&quot;/);
  assert.match(body.html!, /font-size:20px/);
  assert.match(body.html!, /text-align:center/);
  assert.match(body.html!, /<strong>Hello<\/strong> <em>Joseph<\/em> <u>again<\/u>/);
  assert.match(body.html!, /<ul><li><p>First item/);
  assert.match(body.text, /Hello Joseph again/);
  assert.match(body.text, /First item/);
  assert.doesNotMatch(body.text, /untrusted alternate/);
  assert.equal(sanitizeEmailHtml(sanitizeEmailHtml(rich)), sanitizeEmailHtml(rich));
});

test("removes executable HTML, tracking images, unsafe links and CSS", () => {
  const result = sanitizeEmailHtml('<script>alert(1)</script><iframe src="https://evil.example"></iframe><img src="https://evil.example/pixel"><p onclick="alert(1)" style="position:fixed;text-align:right;background:url(https://evil.example)">Safe <a href="javascript:alert(1)">text</a></p>');
  assert.equal(result, '<p style="text-align:right">Safe <a>text</a></p>');
  assert.equal(sanitizeEmailHtml('<a href="https://example.com">Website</a>'), '<a href="https://example.com">Website</a>');
});

test("rejects empty or oversized messages and keeps plain-text callers compatible", () => {
  for (const html of ['<p><br></p>', '<p>&nbsp;\u200B</p>', '<script>not a message</script>']) {
    assert.throws(() => prepareEmailBody("forged fallback", html), /Write something first/);
  }
  assert.throws(() => prepareEmailBody("x".repeat(100001)), /too long/);
  assert.throws(() => prepareEmailBody("x", "x".repeat(200001)), /too long/);
  assert.deepEqual(prepareEmailBody("  Plain message  "), { text: "Plain message", html: undefined });
  assert.equal(prepareEmailBody("", "<p>Bonjour José — café</p><p>Second paragraph</p>").text, "Bonjour José — café\n\nSecond paragraph");
});

test("Gmail MIME contains both plain text and HTML", () => {
  const body = prepareEmailBody("", rich);
  const mime = buildRfc822("sender@example.com", { to: "recipient@example.com", subject: "Formatting test", ...body });
  assert.match(mime, /multipart\/alternative/);
  assert.match(mime, /text\/plain; charset="UTF-8"/);
  assert.match(mime, /text\/html; charset="UTF-8"/);
  assert.ok(mime.includes(body.text));
  assert.ok(mime.includes(body.html!));
});

test("all mailbox providers receive formatted HTML without sending a real email", async () => {
  const originalFetch = globalThis.fetch;
  const payloads: Record<string, unknown>[] = [];
  globalThis.fetch = async (_url, init) => {
    payloads.push(JSON.parse(String(init?.body)));
    return Response.json({ data: { messageId: "mock-zoho" }, id: "mock-google" });
  };
  try {
    const mail = { to: "recipient@example.com", subject: "Mock test", ...prepareEmailBody("", rich) };
    const mailbox = { emailAddress: "sender@example.com", displayName: "Test Sender", providerAccountId: "mock-account" };
    for (const provider of [zohoMailbox, microsoftMailbox, googleMailbox]) {
      const result = await provider.send("mock-token", mailbox, mail);
      assert.equal(result.ok, true);
    }
    assert.equal(payloads[0].mailFormat, "html");
    assert.equal(payloads[0].content, mail.html);
    assert.deepEqual((payloads[1].message as { body: unknown }).body, { contentType: "HTML", content: mail.html });
    const gmail = Buffer.from(String(payloads[2].raw), "base64url").toString("utf8");
    assert.ok(gmail.includes(mail.html!));
    assert.ok(gmail.includes(mail.text));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
