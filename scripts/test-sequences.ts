import assert from "node:assert/strict";
import { test } from "node:test";
import { describeStep, dueAt, stopReason } from "../src/lib/sequences/plan";

test("steps are due a fixed number of days after enrolment", () => {
  const started = new Date("2026-09-06T14:10:00Z");
  assert.equal(dueAt(started, { position: 0, dayOffset: 0, templateKey: "x" }).toISOString(), "2026-09-06T14:10:00.000Z");
  assert.equal(dueAt(started, { position: 2, dayOffset: 14, templateKey: "x" }).toISOString(), "2026-09-20T14:10:00.000Z");
  assert.equal(describeStep({ position: 0, dayOffset: 0, templateKey: "x" }, "Friendly overdue reminder"), "On enrolment · Friendly overdue reminder");
  assert.equal(describeStep({ position: 1, dayOffset: 7, templateKey: "x" }, "Payment follow-up"), "Day 7 · Payment follow-up");
});

test("a chase stops when the invoice is paid, and a reply stops anything", () => {
  const base = { stopWhenPaid: true, stopOnReply: true, kind: "collections", invoiceNumber: "INV-1042", invoiceOpen: true, overdueCents: 125_000, replied: false };
  assert.equal(stopReason(base), null);
  assert.equal(stopReason({ ...base, invoiceOpen: false }), "Invoice INV-1042 paid");
  assert.equal(stopReason({ ...base, replied: true }), "They replied");
  assert.equal(stopReason({ ...base, replied: true, invoiceOpen: false }), "They replied", "a reply is the reason people want to read first");
  /* No invoice named: the company's overdue balance decides. */
  assert.equal(stopReason({ ...base, invoiceNumber: null, overdueCents: 0 }), "Nothing overdue");
  assert.equal(stopReason({ ...base, invoiceNumber: null, overdueCents: 1 }), null);
});

test("relationship series ignore the books, and the rules can be switched off", () => {
  const relationship = { stopWhenPaid: false, stopOnReply: true, kind: "relationship", invoiceNumber: null, invoiceOpen: false, overdueCents: 0, replied: false };
  assert.equal(stopReason(relationship), null);
  assert.equal(stopReason({ ...relationship, replied: true }), "They replied");
  assert.equal(stopReason({ ...relationship, replied: true, stopOnReply: false }), null);
  assert.equal(stopReason({ ...relationship, stopWhenPaid: true, kind: "relationship", overdueCents: 0 }), null, "paid-stop without an invoice only applies to collections");
});
