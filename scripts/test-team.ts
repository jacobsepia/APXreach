import assert from "node:assert/strict";
import { test } from "node:test";
import { emailMatches, inviteStatus, isRole, removalProblem, roleChangeProblem } from "../src/lib/team-rules";

const now = new Date("2026-09-06T12:00:00Z");
const later = new Date("2026-09-20T12:00:00Z");

test("an invitation is pending until used, withdrawn, or past its date", () => {
  assert.equal(inviteStatus({ expiresAt: later, acceptedAt: null, revokedAt: null }, now), "pending");
  assert.equal(inviteStatus({ expiresAt: later, acceptedAt: now, revokedAt: null }, now), "accepted");
  assert.equal(inviteStatus({ expiresAt: later, acceptedAt: null, revokedAt: now }, now), "revoked");
  assert.equal(inviteStatus({ expiresAt: now, acceptedAt: null, revokedAt: null }, now), "expired");
  assert.ok(emailMatches("Joseph@Example.com ", "joseph@example.com"));
  assert.ok(!emailMatches("joseph@example.com", "jacob@example.com"));
  assert.ok(isRole("owner") && isRole("member") && !isRole("admin"));
});

const team = [{ userId: "jacob", role: "owner" }, { userId: "joseph", role: "member" }];

test("only owners manage the team, and the last owner cannot go", () => {
  assert.equal(removalProblem(team, "jacob", "joseph"), null);
  assert.match(removalProblem(team, "joseph", "jacob")!, /Only an owner/);
  assert.match(removalProblem(team, "jacob", "jacob")!, /at least one owner/);
  assert.match(removalProblem(team, "jacob", "nobody")!, /not in this workspace/);
  const two = [...team, { userId: "nat", role: "owner" }];
  assert.equal(removalProblem(two, "jacob", "jacob"), null, "with a second owner, an owner may leave");
  assert.equal(roleChangeProblem(team, "jacob", "joseph", "owner"), null);
  assert.match(roleChangeProblem(team, "jacob", "jacob", "member")!, /at least one owner/);
  assert.match(roleChangeProblem(team, "joseph", "jacob", "member")!, /Only an owner/);
});
