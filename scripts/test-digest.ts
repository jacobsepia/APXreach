import assert from "node:assert/strict";
import { test } from "node:test";
import { digestIsEmpty, renderDigest, type DigestSection } from "../src/lib/digest/format";

const sections: DigestSection[] = [
  { title: "Tasks due", items: [{ text: "Call NexCFO about the renewal", note: "overdue · NexCFO", href: "/companies/abc" }], more: 0 },
  { title: "Replies since yesterday", items: [], more: 0 },
  { title: "Tickets against the clock", items: [{ text: "Portal login broken", note: "Response overdue by 2h · NexCFO", href: "/tickets" }, { text: "Invoice question", note: "Respond within 40m", href: "/tickets" }], more: 3 },
  { title: "Overdue in the books (CAD 1,250.00)", items: [{ text: "NexCFO owes CAD 1,250.00 overdue", href: "/companies/abc" }], more: 0 },
  { title: "Sequences", items: [], more: 0 },
];

test("a quiet morning is empty; anything at all is not", () => {
  assert.equal(digestIsEmpty(sections.map((section) => ({ ...section, items: [] }))), true);
  assert.equal(digestIsEmpty(sections), false);
});

test("the email names what is in it, links every item, and drops empty sections", () => {
  const mail = renderDigest({ workspaceName: "APX Solutions", personName: "Jacob Sepia", date: new Date("2026-09-07T14:10:00Z"), appUrl: "https://apxreach.vercel.app", sections });
  assert.equal(mail.subject, "APX Solutions today: 1 tasks due, 5 tickets against the clock, 1 overdue in the books (cad 1,250.00)");
  assert.ok(mail.text.startsWith("Good morning, Jacob."));
  assert.ok(mail.text.includes("TASKS DUE"));
  assert.ok(!mail.text.includes("REPLIES SINCE YESTERDAY"), "empty sections are left out");
  assert.ok(mail.text.includes("…and 3 more"));
  assert.ok(mail.html.includes('<a href="https://apxreach.vercel.app/companies/abc"'));
  assert.ok(mail.html.includes("Turn it off in"));
  /* HTML from record names is escaped. */
  const hostile = renderDigest({ workspaceName: "A <b>Co</b>", personName: "X", date: new Date(), appUrl: "https://x", sections: [{ title: "Tasks due", items: [{ text: "<script>alert(1)</script>" }] }] });
  assert.ok(!hostile.html.includes("<script>"));
  assert.ok(hostile.html.includes("&lt;script&gt;"));
});
