import assert from "node:assert/strict";
import {
  buildProspectSyncPlan,
  prospectPeople,
  type SyncSnapshot,
  type SyncProspect,
} from "../src/lib/prospect-sync-plan";
import { mapProspect } from "../src/lib/prospect-data";

function prospect(
  id: string,
  extra: Record<string, string> = {},
): SyncProspect {
  const row = mapProspect(
    {
      Company: "Acme",
      Fit: "5",
      Contact: "Alex Founder",
      Website: "https://www.acme.test",
      ...extra,
    },
    "Ranked Prospects",
    2,
  );
  return { id, ...row, companyId: null };
}
const empty: SyncSnapshot = { prospects: [], companies: [], contacts: [] };
const p = prospect("p1", { "Finance lead": "CFO: Jamie Finance (fractional)" });
let plan = buildProspectSyncPlan({
  ...empty,
  prospects: [p, { ...p, id: "p2" }],
});
assert.equal(plan.companies.length, 1);
assert.equal(plan.contacts.length, 2);
assert.equal(plan.links.length, 2);
assert.equal(plan.links[0].companyId, plan.links[1].companyId);
const company = {
  id: "existing",
  name: "Acme",
  domain: "https://www.acme.test/about",
};
plan = buildProspectSyncPlan({
  prospects: [p],
  companies: [company],
  contacts: [
    {
      id: "contact",
      companyId: company.id,
      firstName: "Alex",
      lastName: "Founder",
    },
  ],
});
assert.equal(plan.companies.length, 0);
assert.equal(plan.contacts.length, 1);
assert.equal(plan.contacts[0].firstName, "Jamie Finance");
plan = buildProspectSyncPlan({
  ...empty,
  prospects: [p],
  companies: [company, { ...company, id: "other" }],
});
assert.equal(plan.links.length, 0);
assert.equal(plan.summary.held.length, 1);
plan = buildProspectSyncPlan({
  ...empty,
  prospects: [p],
  companies: [{ ...company, domain: "different.test" }],
});
assert.equal(plan.links.length, 0);
assert.match(plan.summary.held[0].reason, /websites disagree/);
plan = buildProspectSyncPlan({
  ...empty,
  prospects: [p, prospect("p2", { Website: "different.test" })],
});
assert.equal(plan.links.length, 0);
assert.equal(plan.summary.held.length, 2);
plan = buildProspectSyncPlan({
  ...empty,
  prospects: [
    { ...p, status: "disqualified" },
    { ...p, id: "p2", status: "duplicate" },
    prospect("p3", { Company: "(none)" }),
    prospect("p4", { Flag: "Company identity unclear" }),
  ],
});
assert.equal(plan.companies.length, 0);
assert.equal(plan.summary.excluded, 2);
assert.equal(plan.summary.held.length, 2);
assert.equal(
  prospectPeople({
    ...p.data,
    contact: null,
    financeLead: "VP Finance: name not publicly available",
  }).length,
  0,
);
assert.equal(
  prospectPeople({ ...p.data, contact: null, financeLead: "None found" })
    .length,
  0,
);
assert.equal(
  prospectPeople({ ...p.data, contact: "Alex...", financeLead: null }).length,
  0,
);
assert.equal(
  prospectPeople({
    ...p.data,
    contact: "Finance Director",
    financeLead: "CFO: Finance Department",
  }).length,
  0,
);
plan = buildProspectSyncPlan(
  { ...empty, prospects: [prospect("foreign")] },
  "missing",
);
assert.equal(plan.links.length, 0);
const applied = buildProspectSyncPlan({ ...empty, prospects: [p] });
plan = buildProspectSyncPlan({
  prospects: [{ ...p, companyId: applied.companies[0].id }],
  companies: applied.companies,
  contacts: applied.contacts,
});
assert.equal(plan.companies.length, 0);
assert.equal(plan.contacts.length, 0);
assert.equal(plan.links.length, 0);
console.log(
  "PASS prospect sync: deduplication, finance contacts, identity holds, conflicting domains, existing contacts and repeat runs",
);
