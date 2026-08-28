import {
  date,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/*
 * APX Reach — CRM core schema, Phase 0/1.
 *
 * Conventions carried over from APX Ledger: money is integer cents in an
 * explicit currency, day-dates are `date`, instants are `timestamptz`,
 * casing is snake_case at the database and camelCase in TypeScript.
 *
 * Deliberately simple where the blueprint allows it: owners are names (not a
 * users table — Better Auth lands with Sign in with APX), and deals/contacts
 * point at companies with plain foreign keys. The generic associations table
 * from the blueprint arrives when a second association kind needs it.
 */

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const companies = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id).notNull(),
  name: text("name").notNull(),
  domain: text("domain"),
  city: text("city"),
  industry: text("industry"),
  lifecycleStage: text("lifecycle_stage").default("lead").notNull(), // lead | opportunity | customer
  ownerName: text("owner_name"),
  source: text("source"),
  customerSince: date("customer_since"),
  // Rollups synced from APX Ledger. Read-only in Reach; lime in the UI.
  ledgerContactId: text("ledger_contact_id"),
  arBalanceCents: integer("ar_balance_cents").default(0).notNull(),
  overdueCents: integer("overdue_cents").default(0).notNull(),
  avgDaysToPay: integer("avg_days_to_pay"),
  revenueYtdCents: integer("revenue_ytd_cents").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const contacts = pgTable("contacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id).notNull(),
  companyId: uuid("company_id").references(() => companies.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  title: text("title"),
  lifecycleStage: text("lifecycle_stage").default("lead").notNull(),
  ownerName: text("owner_name"),
  ledgerContactId: text("ledger_contact_id"),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const pipelines = pgTable("pipelines", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id).notNull(),
  name: text("name").notNull(),
  displayOrder: integer("display_order").default(0).notNull(),
});

export const pipelineStages = pgTable("pipeline_stages", {
  id: uuid("id").defaultRandom().primaryKey(),
  pipelineId: uuid("pipeline_id").references(() => pipelines.id).notNull(),
  name: text("name").notNull(),
  displayOrder: integer("display_order").default(0).notNull(),
  winProbability: integer("win_probability"),
  kind: text("kind").default("open").notNull(), // open | won | lost
});

export const deals = pgTable("deals", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id).notNull(),
  name: text("name").notNull(),
  companyId: uuid("company_id").references(() => companies.id),
  contactId: uuid("contact_id").references(() => contacts.id),
  pipelineId: uuid("pipeline_id").references(() => pipelines.id).notNull(),
  stageId: uuid("stage_id").references(() => pipelineStages.id).notNull(),
  amountCents: integer("amount_cents").default(0).notNull(),
  currency: text("currency").default("CAD").notNull(),
  closeDate: date("close_date"),
  status: text("status").default("open").notNull(), // open | won | lost
  wonAt: timestamp("won_at", { withTimezone: true }),
  lostReason: text("lost_reason"),
  ownerName: text("owner_name"),
  // Set when a won deal became a Ledger invoice (the CRM → Ledger hand-off).
  ledgerInvoiceNumber: text("ledger_invoice_number"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/*
 * One table, one timeline. Everything that happened to a record is a row here —
 * notes, calls, emails, tasks, and events synced from APX Ledger (source:
 * "ledger"). A task is an activity with a dueAt and no completedAt yet.
 */
export const activities = pgTable("activities", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id).notNull(),
  type: text("type").notNull(), // note | email | call | meeting | task | ledger_event
  source: text("source").default("reach").notNull(), // reach | ledger
  subject: text("subject").notNull(),
  body: text("body"),
  actorName: text("actor_name"),
  companyId: uuid("company_id").references(() => companies.id),
  contactId: uuid("contact_id").references(() => contacts.id),
  dealId: uuid("deal_id").references(() => deals.id),
  dueAt: timestamp("due_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/*
 * A local mirror of open Ledger invoices, written by the sync. Enough for the
 * books panel and the attention list; the full document always lives in Ledger.
 */
export const ledgerInvoices = pgTable("ledger_invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id).notNull(),
  companyId: uuid("company_id").references(() => companies.id).notNull(),
  number: text("number").notNull(),
  issuedDate: date("issued_date").notNull(),
  dueDate: date("due_date").notNull(),
  totalCents: integer("total_cents").notNull(),
  outstandingCents: integer("outstanding_cents").notNull(),
  status: text("status").notNull(), // open | overdue | paid
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const ledgerConnections = pgTable("ledger_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id).notNull(),
  ledgerCompanyName: text("ledger_company_name").notNull(),
  status: text("status").default("connected").notNull(),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
});
