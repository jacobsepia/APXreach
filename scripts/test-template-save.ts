import assert from "node:assert/strict";
import { test } from "node:test";
import { depersonalizeTemplate, renderEmailTemplate, starterTemplates } from "../src/lib/email-templates";
import { emailSignature } from "../src/lib/email-signature";

const values = {
  first_name: "Joseph", last_name: "Sepia", company_name: "NexCFO",
  sender_name: "Jacob Sepia", sender_company: "APX Solutions", sender_email: "jacob@apxsolutions.ca",
  invoice_number: "INV-1042", invoice_balance: "CAD 1,250.00", invoice_due_date: "September 30, 2026",
};

test("an edited, personalised draft turns back into a template with tags", () => {
  const invoiceTemplate = starterTemplates.find(item => item.key === "invoice-overdue")!;
  const rendered = renderEmailTemplate(invoiceTemplate, values);
  assert.deepEqual(rendered.missing, []);
  /* The person edits the rendered copy: a new opening line, and a firmer ask. */
  const edited = rendered.bodyHtml
    .replace("<p>Hi Joseph,</p>", "<p>Hi Joseph, hope the week is going well.</p>")
    .replace("Could you let me know when we can expect payment?", "Please confirm the payment date for NexCFO by reply.");
  const generic = depersonalizeTemplate({ subject: rendered.subject, bodyHtml: edited }, values, "Jacob Sepia");
  assert.equal(generic.subject, "Following up on invoice {{invoice_number}}");
  assert.ok(generic.bodyHtml.startsWith("<p>Hi {{first_name}}, hope the week is going well.</p>"));
  assert.ok(generic.bodyHtml.includes("Please confirm the payment date for {{company_name}} by reply."));
  assert.ok(generic.bodyHtml.includes("{{invoice_balance}}"), "the balance is a tag again");
  assert.ok(generic.bodyHtml.includes("{{invoice_due_date}}"));
  assert.ok(generic.bodyHtml.endsWith("<p>Best,<br>{{sender_signature}}</p>"), "the signature block is one tag");
  assert.ok(!generic.bodyHtml.includes("jacob@apxsolutions.ca"), "no personal detail survives");
  assert.ok(!generic.bodyHtml.includes("Joseph"));
  /* Rendering the saved template again for the same customer gives the edited text back. */
  const again = renderEmailTemplate(generic, values);
  assert.deepEqual(again.missing, []);
  assert.equal(again.bodyHtml, edited);
});

test("the signature is found even when the editor re-serialised it", () => {
  const signature = emailSignature("Jacob Sepia", "APX Solutions", "jacob@apxsolutions.ca");
  const reserialised = signature.html.replace("font-size:12px", "font-size: 12px");
  const generic = depersonalizeTemplate({ subject: "Hello", bodyHtml: `<p>Hi Joseph,</p><p>Regards,<br>${reserialised}</p>` }, values, "Jacob Sepia");
  assert.equal(generic.bodyHtml, "<p>Hi {{first_name}},</p><p>Regards,<br>{{sender_signature}}</p>");
});

test("longer values win and short ones are left alone", () => {
  const generic = depersonalizeTemplate(
    { subject: "Welcome to APX Solutions", bodyHtml: "<p>APX Solutions is glad to have Al aboard.</p>" },
    { sender_company: "APX Solutions", company_name: "APX", first_name: "Al" },
    "",
  );
  assert.equal(generic.subject, "Welcome to {{sender_company}}");
  assert.equal(generic.bodyHtml, "<p>{{sender_company}} is glad to have {{first_name}} aboard.</p>");
  assert.equal(depersonalizeTemplate({ subject: "A note", bodyHtml: "<p>A note</p>" }, { first_name: "A" }, "").bodyHtml, "<p>A note</p>");
});
