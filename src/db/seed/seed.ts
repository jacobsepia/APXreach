import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../schema/index.ts";

/*
 * Demo workspace seed — the same story the design mockups tell, with dates
 * kept relative to today so the demo never goes stale. Idempotent: wipes and
 * rewrites the demo workspace.
 */

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema, casing: "snake_case" });

const now = new Date();
function daysAgo(days: number, hour = 12, minute = 0): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d;
}
function dateStr(daysFromNow: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}
const $ = (dollars: number) => Math.round(dollars * 100);

async function main() {
  // Wipe children before parents so the script can re-run.
  await db.delete(schema.activities);
  await db.delete(schema.syncedInvoices);
  await db.delete(schema.deals);
  await db.delete(schema.pipelineStages);
  await db.delete(schema.pipelines);
  await db.delete(schema.contacts);
  await db.delete(schema.companies);
  await db.delete(schema.connections);
  await db.delete(schema.workspaces);

  const [ws] = await db
    .insert(schema.workspaces)
    .values({ name: "Sepia Consulting", slug: "sepia-consulting" })
    .returning();
  const wsId = ws.id;

  await db.insert(schema.connections).values({
    workspaceId: wsId,
    provider: "apxledger",
    providerLabel: "APX Ledger",
    companyName: "Sepia Consulting",
    status: "connected",
    lastSyncAt: daysAgo(0, 6, 12),
  });

  type CompanySeed = typeof schema.companies.$inferInsert;
  const mk = (c: Partial<CompanySeed> & { name: string }): CompanySeed => ({
    workspaceId: wsId,
    lifecycleStage: "lead",
    ownerName: "Jacob S.",
    ...c,
  });

  const companyRows = await db
    .insert(schema.companies)
    .values([
      mk({
        name: "Maple Grove Dental",
        domain: "maplegrovedental.ca",
        city: "Etobicoke, ON",
        industry: "Dental clinic",
        lifecycleStage: "customer",
        source: "Referral",
        customerSince: "2025-03-01",
        arBalanceCents: $(8450),
        overdueCents: $(3200),
        avgDaysToPay: 38,
        revenueYtdCents: $(46200),
      }),
      mk({
        name: "Stackhouse Brewing",
        domain: "stackhousebrewing.ca",
        city: "Toronto, ON",
        industry: "Brewery",
        lifecycleStage: "customer",
        customerSince: "2024-11-01",
        avgDaysToPay: 24,
        revenueYtdCents: $(28400),
      }),
      mk({
        name: "Harbourview Physio",
        domain: "harbourviewphysio.ca",
        city: "Mississauga, ON",
        industry: "Physiotherapy",
        lifecycleStage: "customer",
        ownerName: "Joseph S.",
        customerSince: "2025-01-01",
        avgDaysToPay: 29,
        revenueYtdCents: $(31000),
      }),
      mk({
        name: "Northshore Outfitters",
        domain: "northshoreoutfitters.ca",
        city: "Barrie, ON",
        industry: "Retail",
        lifecycleStage: "customer",
        ownerName: "Joseph S.",
        customerSince: "2026-08-01",
        arBalanceCents: $(18200),
        avgDaysToPay: 31,
        revenueYtdCents: $(18200),
      }),
      mk({
        name: "Kensington Florists",
        domain: "kensingtonflorists.ca",
        city: "Toronto, ON",
        industry: "Florist",
        lifecycleStage: "opportunity",
      }),
      mk({
        name: "Bluewater Marine Supply",
        domain: "bluewatermarine.ca",
        city: "Sarnia, ON",
        industry: "Marine supply",
        lifecycleStage: "opportunity",
      }),
      mk({
        name: "Cedar & Ash Interiors",
        domain: "cedarandash.ca",
        city: "Toronto, ON",
        industry: "Interior design",
        lifecycleStage: "opportunity",
        ownerName: "Joseph S.",
      }),
      mk({
        name: "True North Roofing",
        domain: "truenorthroofing.ca",
        city: "Vaughan, ON",
        industry: "Roofing",
      }),
      mk({
        name: "Lakeside Veterinary Clinic",
        domain: "lakesidevet.ca",
        city: "Oakville, ON",
        industry: "Veterinary",
        ownerName: "Joseph S.",
      }),
      mk({
        name: "Gallagher & Sons Plumbing",
        domain: "gallagherandsons.ca",
        city: "Scarborough, ON",
        industry: "Plumbing",
        lifecycleStage: "customer",
        customerSince: "2024-06-01",
        arBalanceCents: $(4380),
        overdueCents: $(2400),
        avgDaysToPay: 41,
        revenueYtdCents: $(12300),
      }),
      mk({
        name: "Dundas Auto Group",
        domain: "dundasauto.ca",
        city: "Hamilton, ON",
        industry: "Auto dealer",
        lifecycleStage: "customer",
        customerSince: "2025-05-01",
        arBalanceCents: $(1750),
        overdueCents: $(1750),
        avgDaysToPay: 45,
        revenueYtdCents: $(9800),
      }),
      mk({
        name: "Riverdale Print Co",
        domain: "riverdaleprint.ca",
        city: "Toronto, ON",
        industry: "Printing",
        lifecycleStage: "customer",
        customerSince: "2025-02-01",
        arBalanceCents: $(8500),
        overdueCents: $(2500),
        avgDaysToPay: 33,
        revenueYtdCents: $(15600),
      }),
    ])
    .returning();

  const co = Object.fromEntries(companyRows.map((c) => [c.name, c.id]));

  await db.insert(schema.contacts).values([
    { workspaceId: wsId, companyId: co["Maple Grove Dental"], firstName: "Amelia", lastName: "Chen", title: "Owner", email: "amelia@maplegrovedental.ca", lifecycleStage: "customer", ownerName: "Jacob S.", lastActivityAt: daysAgo(0, 9, 0) },
    { workspaceId: wsId, companyId: co["Maple Grove Dental"], firstName: "Priya", lastName: "Raman", title: "Office manager", email: "priya@maplegrovedental.ca", lifecycleStage: "customer", ownerName: "Jacob S.", lastActivityAt: daysAgo(9, 11, 20) },
    { workspaceId: wsId, companyId: co["Bluewater Marine Supply"], firstName: "Dan", lastName: "Kowalski", title: "General manager", email: "dan@bluewatermarine.ca", lifecycleStage: "opportunity", ownerName: "Jacob S.", lastActivityAt: daysAgo(1, 10, 0) },
    { workspaceId: wsId, companyId: co["Stackhouse Brewing"], firstName: "Marcus", lastName: "Bell", title: "Co-founder", email: "marcus@stackhousebrewing.ca", lifecycleStage: "customer", ownerName: "Jacob S.", lastActivityAt: daysAgo(1, 9, 3) },
    { workspaceId: wsId, companyId: co["Kensington Florists"], firstName: "Sofia", lastName: "Restrepo", title: "Owner", email: "sofia@kensingtonflorists.ca", lifecycleStage: "opportunity", ownerName: "Jacob S.", lastActivityAt: daysAgo(14, 9, 15) },
    { workspaceId: wsId, companyId: co["Harbourview Physio"], firstName: "Owen", lastName: "MacLeod", title: "Clinic director", email: "owen@harbourviewphysio.ca", lifecycleStage: "customer", ownerName: "Joseph S.", lastActivityAt: daysAgo(3, 14, 0) },
    { workspaceId: wsId, companyId: co["Cedar & Ash Interiors"], firstName: "Grace", lastName: "Ito", title: "Principal", email: "grace@cedarandash.ca", lifecycleStage: "opportunity", ownerName: "Joseph S.", lastActivityAt: daysAgo(0, 8, 40) },
    { workspaceId: wsId, companyId: co["True North Roofing"], firstName: "Liam", lastName: "O'Byrne", title: "Owner", email: "liam@truenorthroofing.ca", lifecycleStage: "lead", ownerName: "Jacob S.", lastActivityAt: daysAgo(6, 13, 0) },
    { workspaceId: wsId, companyId: co["Lakeside Veterinary Clinic"], firstName: "Nadia", lastName: "Fortin", title: "Practice manager", email: "nadia@lakesidevet.ca", lifecycleStage: "lead", ownerName: "Joseph S.", lastActivityAt: daysAgo(3, 15, 30) },
    { workspaceId: wsId, companyId: co["Gallagher & Sons Plumbing"], firstName: "Wes", lastName: "Gallagher", title: "Owner", email: "wes@gallagherandsons.ca", lifecycleStage: "customer", ownerName: "Jacob S.", lastActivityAt: daysAgo(5, 10, 30) },
    { workspaceId: wsId, companyId: co["Dundas Auto Group"], firstName: "Rina", lastName: "Park", title: "Controller", email: "rina@dundasauto.ca", lifecycleStage: "customer", ownerName: "Jacob S.", lastActivityAt: daysAgo(12, 9, 0) },
    { workspaceId: wsId, companyId: co["Riverdale Print Co"], firstName: "Theo", lastName: "Baptiste", title: "Owner", email: "theo@riverdaleprint.ca", lifecycleStage: "customer", ownerName: "Jacob S.", lastActivityAt: daysAgo(8, 16, 0) },
    { workspaceId: wsId, companyId: co["Northshore Outfitters"], firstName: "Hannah", lastName: "Liu", title: "Owner", email: "hannah@northshoreoutfitters.ca", lifecycleStage: "customer", ownerName: "Joseph S.", lastActivityAt: daysAgo(7, 11, 0) },
  ]);

  const [pipeline] = await db
    .insert(schema.pipelines)
    .values({ workspaceId: wsId, name: "Sales pipeline", displayOrder: 0 })
    .returning();

  const stageRows = await db
    .insert(schema.pipelineStages)
    .values([
      { pipelineId: pipeline.id, name: "Qualified", displayOrder: 0, winProbability: 20, kind: "open" },
      { pipelineId: pipeline.id, name: "Proposal sent", displayOrder: 1, winProbability: 45, kind: "open" },
      { pipelineId: pipeline.id, name: "Negotiation", displayOrder: 2, winProbability: 70, kind: "open" },
      { pipelineId: pipeline.id, name: "Closed won", displayOrder: 3, winProbability: 100, kind: "won" },
      { pipelineId: pipeline.id, name: "Closed lost", displayOrder: 4, winProbability: 0, kind: "lost" },
    ])
    .returning();
  const st = Object.fromEntries(stageRows.map((s) => [s.name, s.id]));

  type DealSeed = typeof schema.deals.$inferInsert;
  const deal = (d: Partial<DealSeed> & { name: string; stageId: string; amountCents: number }): DealSeed => ({
    workspaceId: wsId,
    pipelineId: pipeline.id,
    ownerName: "Jacob S.",
    status: "open",
    ...d,
  });

  const dealRows = await db
    .insert(schema.deals)
    .values([
      // Qualified — $46,500 across 5
      deal({ name: "Annual bookkeeping", companyId: co["Stackhouse Brewing"], stageId: st["Qualified"], amountCents: $(14000), closeDate: dateStr(33) }),
      deal({ name: "Clinic onboarding", companyId: co["Lakeside Veterinary Clinic"], stageId: st["Qualified"], amountCents: $(9500), closeDate: dateStr(48), ownerName: "Joseph S." }),
      deal({ name: "Payroll add-on", companyId: co["True North Roofing"], stageId: st["Qualified"], amountCents: $(8000), closeDate: dateStr(36) }),
      deal({ name: "Storefront books", companyId: co["Dundas Auto Group"], stageId: st["Qualified"], amountCents: $(6500), closeDate: dateStr(40) }),
      deal({ name: "Print-run costing", companyId: co["Riverdale Print Co"], stageId: st["Qualified"], amountCents: $(8500), closeDate: dateStr(44) }),
      // Proposal sent — $88,000 across 4
      deal({ name: "Website retainer", companyId: co["Kensington Florists"], stageId: st["Proposal sent"], amountCents: $(21000), closeDate: dateStr(15), updatedAt: daysAgo(14, 9, 15) }),
      deal({ name: "Second operatory fit-out", companyId: co["Maple Grove Dental"], stageId: st["Proposal sent"], amountCents: $(12000), closeDate: dateStr(22), updatedAt: daysAgo(1, 15, 40) }),
      deal({ name: "Store build-out books", companyId: co["Cedar & Ash Interiors"], stageId: st["Proposal sent"], amountCents: $(35000), closeDate: dateStr(29), ownerName: "Joseph S.", updatedAt: daysAgo(0, 8, 40) }),
      deal({ name: "Seasonal cash plan", companyId: co["Gallagher & Sons Plumbing"], stageId: st["Proposal sent"], amountCents: $(20000), closeDate: dateStr(26), updatedAt: daysAgo(5, 10, 30) }),
      // Negotiation — $50,000 across 3
      deal({ name: "Equipment lease books", companyId: co["Bluewater Marine Supply"], stageId: st["Negotiation"], amountCents: $(24000), closeDate: dateStr(8), updatedAt: daysAgo(1, 10, 0) }),
      deal({ name: "Multi-location setup", companyId: co["Harbourview Physio"], stageId: st["Negotiation"], amountCents: $(16500), closeDate: dateStr(11), ownerName: "Joseph S.", updatedAt: daysAgo(3, 14, 0) }),
      deal({ name: "Year-end catch-up", companyId: co["Gallagher & Sons Plumbing"], stageId: st["Negotiation"], amountCents: $(9500), closeDate: dateStr(18), updatedAt: daysAgo(5, 10, 30) }),
      // Closed won this month — $32,400 across 3
      deal({ name: "Quarterly HST filing", companyId: co["Stackhouse Brewing"], stageId: st["Closed won"], amountCents: $(4200), status: "won", wonAt: daysAgo(16), closeDate: dateStr(-16), ledgerInvoiceNumber: "INV-1055" }),
      deal({ name: "New books setup", companyId: co["Northshore Outfitters"], stageId: st["Closed won"], amountCents: $(18200), status: "won", wonAt: daysAgo(7), closeDate: dateStr(-7), ownerName: "Joseph S.", ledgerInvoiceNumber: "INV-1071" }),
      deal({ name: "Cash-flow cleanup", companyId: co["Harbourview Physio"], stageId: st["Closed won"], amountCents: $(10000), status: "won", wonAt: daysAgo(3), closeDate: dateStr(-3), ledgerInvoiceNumber: "INV-1067" }),
    ])
    .returning();
  const dl = Object.fromEntries(dealRows.map((d) => [d.name, d.id]));

  await db.insert(schema.syncedInvoices).values([
    { workspaceId: wsId, companyId: co["Maple Grove Dental"], number: "INV-1058", issuedDate: dateStr(-57), dueDate: dateStr(-32), totalCents: $(3200), outstandingCents: $(3200), status: "overdue" },
    { workspaceId: wsId, companyId: co["Maple Grove Dental"], number: "INV-1063", issuedDate: dateStr(-13), dueDate: dateStr(9), totalCents: $(5250), outstandingCents: $(5250), status: "open" },
    { workspaceId: wsId, companyId: co["Northshore Outfitters"], number: "INV-1071", issuedDate: dateStr(-7), dueDate: dateStr(23), totalCents: $(18200), outstandingCents: $(18200), status: "open" },
    { workspaceId: wsId, companyId: co["Gallagher & Sons Plumbing"], number: "INV-1044", issuedDate: dateStr(-75), dueDate: dateStr(-45), totalCents: $(2400), outstandingCents: $(2400), status: "overdue" },
    { workspaceId: wsId, companyId: co["Gallagher & Sons Plumbing"], number: "INV-1066", issuedDate: dateStr(-10), dueDate: dateStr(20), totalCents: $(1980), outstandingCents: $(1980), status: "open" },
    { workspaceId: wsId, companyId: co["Dundas Auto Group"], number: "INV-1039", issuedDate: dateStr(-80), dueDate: dateStr(-50), totalCents: $(1750), outstandingCents: $(1750), status: "overdue" },
    { workspaceId: wsId, companyId: co["Riverdale Print Co"], number: "INV-1047", issuedDate: dateStr(-66), dueDate: dateStr(-38), totalCents: $(2500), outstandingCents: $(2500), status: "overdue" },
    { workspaceId: wsId, companyId: co["Riverdale Print Co"], number: "INV-1069", issuedDate: dateStr(-8), dueDate: dateStr(22), totalCents: $(6000), outstandingCents: $(6000), status: "open" },
  ]);

  await db.insert(schema.activities).values([
    // Tasks
    { workspaceId: wsId, type: "task", subject: "Call Dan Kowalski about the equipment lease", companyId: co["Bluewater Marine Supply"], dealId: dl["Equipment lease books"], dueAt: daysAgo(1, 16, 0), actorName: "Jacob S." },
    { workspaceId: wsId, type: "task", subject: "Send revised proposal to Cedar & Ash Interiors", companyId: co["Cedar & Ash Interiors"], dealId: dl["Store build-out books"], dueAt: daysAgo(0, 11, 0), actorName: "Jacob S." },
    { workspaceId: wsId, type: "task", subject: "Review the four new pricing-page leads", dueAt: daysAgo(0, 14, 0), actorName: "Jacob S." },
    { workspaceId: wsId, type: "task", subject: "Meeting notes from Harbourview Physio kickoff", companyId: co["Harbourview Physio"], dueAt: daysAgo(0, 16, 30), actorName: "Joseph S." },
    // Maple Grove timeline
    { workspaceId: wsId, type: "ledger_event", source: "ledger", subject: "INV-1058 crossed 30 days overdue", body: "$3,200, issued eight weeks ago. Collect has paused its chase while the fit-out proposal is open.", companyId: co["Maple Grove Dental"], occurredAt: daysAgo(0, 6, 12) },
    { workspaceId: wsId, type: "email", subject: "Email to Dr. Chen — “Fit-out proposal, revised numbers”", body: "Opened twice, link clicked.", actorName: "Jacob S.", companyId: co["Maple Grove Dental"], dealId: dl["Second operatory fit-out"], occurredAt: daysAgo(1, 15, 40) },
    { workspaceId: wsId, type: "ledger_event", source: "ledger", subject: "Payment received — $2,100 against INV-1051", body: "Paid in full.", companyId: co["Maple Grove Dental"], occurredAt: daysAgo(6, 9, 3) },
    { workspaceId: wsId, type: "call", subject: "Call with Priya Raman — 18 min", body: "Budget approved for the second operatory; wants the work started before December.", actorName: "Jacob S.", companyId: co["Maple Grove Dental"], dealId: dl["Second operatory fit-out"], occurredAt: daysAgo(9, 11, 20) },
    { workspaceId: wsId, type: "note", subject: "Fixed-fee quote requested", body: "Clinic is adding a second operatory; Dr. Chen asked for a fixed-fee quote rather than hourly.", actorName: "Joseph S.", companyId: co["Maple Grove Dental"], occurredAt: daysAgo(10, 16, 5) },
    { workspaceId: wsId, type: "ledger_event", source: "ledger", subject: "Invoice sent — INV-1063 for $5,250", body: "August retainer. Opened the same day.", companyId: co["Maple Grove Dental"], occurredAt: daysAgo(13, 8, 30) },
    // Elsewhere, for the dashboard's attention list
    { workspaceId: wsId, type: "ledger_event", source: "ledger", subject: "Stackhouse Brewing paid $4,200, nine days early", body: "INV-1055, settled in full.", companyId: co["Stackhouse Brewing"], occurredAt: daysAgo(1, 9, 3) },
    { workspaceId: wsId, type: "meeting", subject: "Kickoff — multi-location setup", body: "Scoped the Mississauga and Oakville locations.", actorName: "Joseph S.", companyId: co["Harbourview Physio"], dealId: dl["Multi-location setup"], occurredAt: daysAgo(3, 14, 0) },
  ]);

  console.log("Seeded workspace:", ws.slug);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
