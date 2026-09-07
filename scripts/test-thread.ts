import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeSubject, threadKeyFor } from "../src/lib/mailbox/thread";

test("reply and forward prefixes come off, however many are stacked", () => {
  assert.equal(normalizeSubject("Re: Invoice 12"), "invoice 12");
  assert.equal(normalizeSubject("RE: FW: Re: Following up"), "following up");
  assert.equal(normalizeSubject("Re[2]: Quarterly review"), "quarterly review");
  assert.equal(normalizeSubject("AW: Rechnung"), "rechnung");
  assert.equal(normalizeSubject("  Invoice   12  "), "invoice 12");
  assert.equal(normalizeSubject("Re:"), "");
  /* A subject that only looks like a prefix keeps its meaning. */
  assert.equal(normalizeSubject("Recruitment update"), "recruitment update");
});

test("a reply lands in the same conversation as what it answers", () => {
  const sent = threadKeyFor("Following up on Pass due Invoice", "contact-1", "joseph@example.com");
  const reply = threadKeyFor("Re: Following up on Pass due Invoice", "contact-1", "joseph@example.com");
  assert.equal(sent, reply);
  /* A different person is a different conversation, same subject or not. */
  assert.notEqual(sent, threadKeyFor("Re: Following up on Pass due Invoice", "contact-2", "al@example.com"));
  /* Nobody on a record: the address holds the thread together. */
  assert.equal(
    threadKeyFor("Question", null, "Stranger@Example.com"),
    threadKeyFor("Re: Question", null, "stranger@example.com "),
  );
  assert.match(threadKeyFor("", "contact-1", "x@y.ca"), /\(no subject\)$/);
});
