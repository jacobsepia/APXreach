import assert from "node:assert/strict";
import { test } from "node:test";
import { emailSignature, isSignatureOnly } from "../src/lib/email-signature";
import { renderEmailTemplate, starterTemplates } from "../src/lib/email-templates";
import { prepareEmailBody, sanitizeEmailHtml } from "../src/lib/email-content";

test("professional signature uses sender details and escapes HTML", () => {
  const signature = emailSignature("Jacob Sepia", "APX & Solutions", "jacob@example.com");
  assert.equal(signature.text, "Jacob Sepia\nAPX & Solutions\njacob@example.com");
  assert.ok(signature.html.startsWith("<strong>Jacob Sepia</strong>"));
  assert.ok(signature.html.includes("APX &amp; Solutions"));
  assert.ok(!emailSignature("<script>alert(1)</script>", "").html.includes("<script>"));
  assert.equal(emailSignature(" Jacob ", "", "").html, "<strong>Jacob</strong>");
});
test("each starter includes exactly one sender signature, with plain-text delivery fallback", () => {
  for (const template of starterTemplates) {
    const result = renderEmailTemplate(template, { first_name: "Joseph", company_name: "Customer Ltd", sender_name: "Jacob Sepia", sender_company: "APX Solutions", sender_email: "sender@example.com", milestone: "your new office", follow_up_topic: "our project", next_step: "a call", invoice_number: "INV-1", invoice_balance: "CAD 100.00", invoice_due_date: "September 30, 2026" });
    assert.deepEqual(result.missing, []);
    assert.equal(result.bodyHtml.split("sender@example.com").length - 1, 1);
    const body = prepareEmailBody("", result.bodyHtml);
    assert.ok(body.text.endsWith("Jacob Sepia\nAPX Solutions\nsender@example.com"));
    assert.ok(sanitizeEmailHtml(result.bodyHtml).includes("<strong>Jacob Sepia</strong>"));
  }
});
test("missing optional details are omitted and a signature alone is not a message", () => {
  const result = renderEmailTemplate(starterTemplates[0], { first_name: "Joseph", company_name: "Client", sender_name: "Jacob", sender_company: "APX" });
  assert.deepEqual(result.missing, []);
  const signature = "Best,\nJacob\nAPX";
  assert.equal(isSignatureOnly("\nBest,\n\nJacob\nAPX\n", signature), true);
  assert.equal(isSignatureOnly("Hello Joseph\n" + signature, signature), false);
  assert.equal(isSignatureOnly("", signature), true);
});
