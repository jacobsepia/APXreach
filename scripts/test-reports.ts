import assert from "node:assert/strict";
import { test } from "node:test";
import { agingBucket, bucketKeyFor, bucketsFor, compactMoney, delta, monthBuckets, percent, weekBuckets, weekKey } from "../src/lib/reports";

test("months run from the first month to the last, labelled with the year only when it differs", () => {
  const buckets = monthBuckets(new Date(2025, 10, 15), new Date(2026, 1, 3));
  assert.deepEqual(buckets.map((b) => b.key), ["2025-11", "2025-12", "2026-01", "2026-02"]);
  assert.deepEqual(buckets.map((b) => b.label), ["Nov 25", "Dec 25", "Jan", "Feb"]);
});

test("weeks start on Monday and cover the whole span", () => {
  const buckets = weekBuckets(new Date(2026, 8, 2), new Date(2026, 8, 16)); // Wed Sep 2 → Wed Sep 16
  assert.deepEqual(buckets.map((b) => b.key), ["2026-08-31", "2026-09-07", "2026-09-14"]);
  assert.equal(weekKey(new Date(2026, 8, 6)), "2026-08-31"); // a Sunday belongs to the Monday before it
  assert.equal(bucketKeyFor(90, new Date(2026, 8, 6)), "2026-08-31");
  assert.equal(bucketKeyFor(365, new Date(2026, 8, 6)), "2026-09");
  assert.equal(bucketsFor(365, new Date(2025, 8, 6), new Date(2026, 8, 6)).length, 13);
});

test("aging buckets follow days past due", () => {
  assert.equal(agingBucket("2026-09-10", "2026-09-06"), "Current");
  assert.equal(agingBucket("2026-09-06", "2026-09-06"), "Current");
  assert.equal(agingBucket("2026-08-20", "2026-09-06"), "1–30 days");
  assert.equal(agingBucket("2026-07-20", "2026-09-06"), "31–60 days");
  assert.equal(agingBucket("2026-06-20", "2026-09-06"), "61–90 days");
  assert.equal(agingBucket("2026-01-01", "2026-09-06"), "Over 90");
});

test("figures shorten the way an axis needs", () => {
  assert.equal(compactMoney(45_000), "$450");
  assert.equal(compactMoney(125_000), "$1.3K");
  assert.equal(compactMoney(1_250_000), "$13K");
  assert.equal(compactMoney(125_000_000), "$1.3M");
  assert.equal(compactMoney(-200_000), "-$2K");
  assert.equal(percent(3, 4), "75%");
  assert.equal(percent(0, 0), "—");
  assert.deepEqual(delta(150, 100), { text: "+50% vs previous", direction: "up" });
  assert.deepEqual(delta(50, 100), { text: "-50% vs previous", direction: "down" });
  assert.deepEqual(delta(5, 0), { text: "new this period", direction: "up" });
  assert.deepEqual(delta(0, 0), { text: "no change", direction: "flat" });
});
