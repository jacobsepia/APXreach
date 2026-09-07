import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAudience, footerHtml, footerText, type AudienceCandidate } from "../src/lib/campaigns/audience";
import { contactFromToken, oneClickUnsubscribeUrl, unsubscribeToken, unsubscribeUrl } from "../src/lib/campaigns/unsubscribe";
import { htmlToPlain } from "../src/lib/campaigns/send";

process.env.BETTER_AUTH_SECRET ||= "test-secret-for-signing-unsubscribe-links";

const person = (over: Partial<AudienceCandidate> & { contactId: string }): AudienceCandidate => ({
  name: "Dana Reid", email: "dana@example.ca", unsubscribedAt: null, companyOverdueCents: 0, companyName: "Reid Roofing", ...over,
});

test("everyone reachable is sent to, once", () => {
  const { send, held } = buildAudience(
    [person({ contactId: "1" }), person({ contactId: "2", name: "Sam Ng", email: "sam@example.ca" })],
    { holdDunning: true },
  );
  assert.deepEqual(send.map((row) => row.email), ["dana@example.ca", "sam@example.ca"]);
  assert.equal(held.length, 0);
});

test("a company with an overdue balance is held back — the rule the books make possible", () => {
  const { send, held } = buildAudience([person({ contactId: "1", companyOverdueCents: 145_000 })], { holdDunning: true });
  assert.equal(send.length, 0);
  assert.deepEqual(held, [{ contactId: "1", name: "Dana Reid", reason: "Reid Roofing has an overdue balance" }]);
});

test("the dunning hold can be turned off deliberately, and nothing else changes", () => {
  const { send, held } = buildAudience([person({ contactId: "1", companyOverdueCents: 145_000 })], { holdDunning: false });
  assert.equal(send.length, 1);
  assert.equal(held.length, 0);
});

test("no address, unsubscribed and duplicate addresses each say why", () => {
  const { send, held } = buildAudience(
    [
      person({ contactId: "1", email: null, name: "No Address" }),
      person({ contactId: "2", name: "Left Us", unsubscribedAt: new Date("2026-01-04T00:00:00Z") }),
      person({ contactId: "3", name: "First Record", email: "shared@example.ca" }),
      person({ contactId: "4", name: "Second Record", email: "  SHARED@example.ca " }),
    ],
    { holdDunning: true },
  );
  assert.deepEqual(send.map((row) => row.contactId), ["3"]);
  assert.deepEqual(held.map((row) => row.reason), ["No email address", "Unsubscribed", "Another record has the same address"]);
  /* The address that goes out is normalised, so the same person is never sent to twice. */
  assert.equal(send[0].email, "shared@example.ca");
});

test("unsubscribed beats an overdue balance — somebody who left is not a dunning question", () => {
  const { held } = buildAudience(
    [person({ contactId: "1", unsubscribedAt: new Date(), companyOverdueCents: 90_000 })],
    { holdDunning: true },
  );
  assert.equal(held[0].reason, "Unsubscribed");
});

test("a contact with no company is reachable, dunning hold or not", () => {
  const { send } = buildAudience([person({ contactId: "1", companyName: null })], { holdDunning: true });
  assert.equal(send.length, 1);
});

test("an unsubscribe token round-trips, and refuses anything not signed by us", () => {
  const token = unsubscribeToken("c0ffee00-0000-4000-8000-000000000001");
  assert.equal(contactFromToken(token), "c0ffee00-0000-4000-8000-000000000001");
  /* Edited id, edited signature, and shapes that are not tokens at all. */
  assert.equal(contactFromToken(token.replace(/^c0ffee00/, "deadbee0")), null);
  assert.equal(contactFromToken(`${token}x`), null);
  assert.equal(contactFromToken("c0ffee00-0000-4000-8000-000000000001"), null);
  assert.equal(contactFromToken(""), null);
  assert.equal(contactFromToken(".abc"), null);
});

test("one token, two links: the page a person lands on and the endpoint a mail client posts to", () => {
  const id = "c0ffee00-0000-4000-8000-000000000002";
  assert.equal(unsubscribeUrl("https://apxreach.vercel.app/", id), `https://apxreach.vercel.app/unsubscribe/${unsubscribeToken(id)}`);
  assert.equal(oneClickUnsubscribeUrl("https://apxreach.vercel.app", id), `https://apxreach.vercel.app/api/unsubscribe/${unsubscribeToken(id)}`);
});

test("the footer carries the sender and the way out, and escapes a name that looks like markup", () => {
  const options = { workspaceName: 'Reid & Sons <Roofing>', fromEmail: "hello@reid.ca", unsubscribeUrl: "https://x.test/unsubscribe/t" };
  const html = footerHtml(options);
  assert.ok(html.includes("Reid &amp; Sons &lt;Roofing&gt;"));
  assert.ok(!html.includes("<Roofing>"));
  assert.ok(html.includes('href="https://x.test/unsubscribe/t"'));
  const text = footerText(options);
  assert.ok(text.includes("Unsubscribe: https://x.test/unsubscribe/t"));
  assert.ok(text.includes("hello@reid.ca"));
});

test("the plain-text copy keeps the words and the links", () => {
  assert.equal(htmlToPlain("<p>Hi there,</p><p>We&rsquo;re open Saturdays now.</p>"), "Hi there,\n\nWe’re open Saturdays now.");
  assert.ok(htmlToPlain('<p><a href="https://reid.ca/book">Book a slot</a></p>').includes("https://reid.ca/book"));
  assert.equal(htmlToPlain("<p></p>"), "");
});
