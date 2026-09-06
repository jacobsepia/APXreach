import assert from "node:assert/strict";
import { test } from "node:test";
import { duration, isPriority, slaDeadlines, slaState } from "../src/lib/tickets/sla";

const opened = new Date("2026-09-06T09:00:00Z");
const base = { status: "open", createdAt: opened, firstRespondedAt: null, resolvedAt: null, ...slaDeadlines("normal", opened) };

test("deadlines follow priority", () => {
  assert.equal(base.firstResponseDueAt.toISOString(), "2026-09-06T17:00:00.000Z");
  assert.equal(base.resolveDueAt.toISOString(), "2026-09-11T09:00:00.000Z");
  assert.equal(slaDeadlines("urgent", opened).firstResponseDueAt.toISOString(), "2026-09-06T11:00:00.000Z");
  assert.ok(isPriority("high") && !isPriority("asap"));
});

test("the response clock runs until someone picks the ticket up, then the resolution clock", () => {
  assert.deepEqual(slaState(base, new Date("2026-09-06T10:00:00Z")), { label: "Respond within 7h", tone: "ok" });
  assert.deepEqual(slaState(base, new Date("2026-09-06T16:30:00Z")), { label: "Respond within 30m", tone: "soon" });
  assert.deepEqual(slaState(base, new Date("2026-09-06T19:00:00Z")), { label: "Response overdue by 2h", tone: "breached" });
  const picked = { ...base, firstRespondedAt: new Date("2026-09-06T12:00:00Z") };
  assert.deepEqual(slaState(picked, new Date("2026-09-08T09:00:00Z")), { label: "Resolve within 3d", tone: "ok" });
  assert.deepEqual(slaState(picked, new Date("2026-09-12T09:00:00Z")), { label: "Resolution overdue by 24h", tone: "breached" });
});

test("a resolved ticket reports how long it took, and whether it was late", () => {
  assert.deepEqual(slaState({ ...base, status: "resolved", resolvedAt: new Date("2026-09-07T09:00:00Z") }), { label: "Resolved in 24h", tone: "done" });
  assert.deepEqual(slaState({ ...base, status: "resolved", resolvedAt: new Date("2026-09-13T09:00:00Z") }), { label: "Resolved in 7d, past its deadline", tone: "done" });
  assert.equal(duration(90_000), "2m");
  assert.equal(duration(47 * 3_600_000), "47h");
  assert.equal(duration(49 * 3_600_000), "2d");
});
