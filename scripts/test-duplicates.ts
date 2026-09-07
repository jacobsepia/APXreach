import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeName } from "../src/lib/duplicate-rules";

test("company names match once case, punctuation and the usual suffixes are ignored", () => {
  assert.equal(normalizeName("NexCFO Inc."), normalizeName("nexcfo"));
  assert.equal(normalizeName("Harbour-View Physio Ltd"), normalizeName("harbour view physio"));
  assert.equal(normalizeName("APX Solutions Corp"), "apx solutions");
  assert.notEqual(normalizeName("APX Solutions"), normalizeName("APX Ledger"));
});
