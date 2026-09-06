import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export * from "./auth";
import { user } from "./auth";

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
  /* Today's AI tone rewrites, so a stuck button cannot run up a bill overnight. */
  rewriteCount: integer("rewrite_count").default(0).notNull(),
  rewriteCountDay: date("rewrite_count_day"),
});

export const workspaceMembers = pgTable("workspace_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id).notNull(),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }).notNull(),
  role: text("role").default("owner").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("workspace_members_user_workspace_idx").on(table.userId, table.workspaceId)]);

// Starter templates are code defaults; workspace edits override them without
// changing another workspace or already-composed emails.
export const emailTemplates = pgTable("email_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id).notNull(),
  key: text("key").notNull(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  revision: text("revision").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("email_templates_workspace_key_idx").on(table.workspaceId, table.key)]);

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
  // Rollups synced from the connected books provider. Read-only in Reach;
  // lime in the UI. externalContactId is the contact's id inside that provider.
  externalContactId: text("external_contact_id"),
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
  externalContactId: text("external_contact_id"),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const pipelines = pgTable("pipelines", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id).notNull(),
  name: text("name").notNull(),
  displayOrder: integer("display_order").default(0).notNull(),
  /** sales — deals move through it; support — tickets do. Same stages engine, separate boards. */
  kind: text("kind").default("sales").notNull(),
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
 * A local mirror of the open receivables from whichever books provider is
 * connected, written by the sync. Enough for the books panels and the
 * attention list; the full document always lives in the provider.
 */
export const syncedInvoices = pgTable("synced_invoices", {
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

/*
 * A person's connected mailbox — Zoho, Gmail or Outlook.
 *
 * Keyed by USER, not workspace: mail is sent as a person, from the address
 * their clients already recognise, so two colleagues hold two mailboxes and
 * neither sends as the other. That is also why the tokens live here rather
 * than on `connections`, which is the workspace's shared link to the books.
 */
export const mailboxes = pgTable("mailboxes", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id).notNull(),
  /** Better Auth's user id. Text, because that table is not ours to reshape. */
  userId: text("user_id").notNull(),
  provider: text("provider").notNull(), // zoho | google | microsoft
  providerLabel: text("provider_label").notNull(),
  /** Where mail goes out from, as the provider reported it — never typed in. */
  emailAddress: text("email_address").notNull(),
  displayName: text("display_name"),
  /** The provider's own handle for the mailbox — Zoho sends by account id. */
  providerAccountId: text("provider_account_id"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  scopes: text("scopes"),
  status: text("status").default("connected").notNull(), // connected | disconnected
  /** How far the reply poll has read. Providers disagree on shape, so: text. */
  syncCursor: text("sync_cursor"),
  lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/*
 * Every email that went through Reach, in either direction. The timeline gets
 * a one-line activity for each; this holds the message itself — the body, who
 * sent it, and the provider's id so a reply can be matched back to what it
 * answers. Bodies are kept because a follow-up needs the thread, and the
 * mailbox is the person's own: nothing here is Reach's to lose.
 */
export const emailMessages = pgTable("email_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id).notNull(),
  mailboxId: uuid("mailbox_id").references(() => mailboxes.id),
  companyId: uuid("company_id").references(() => companies.id),
  contactId: uuid("contact_id").references(() => contacts.id),
  direction: text("direction").notNull(), // outbound | inbound
  fromAddress: text("from_address").notNull(),
  toAddress: text("to_address").notNull(),
  subject: text("subject").notNull(),
  bodyText: text("body_text").notNull(),
  bodyHtml: text("body_html"),
  /** The provider's id for the message, where it gave one. Graph gives none. */
  providerMessageId: text("provider_message_id"),
  /** The outbound message this one answers, for threading in the Inbox. */
  inReplyToId: uuid("in_reply_to_id"),
  /** What was attached — names, sizes and types. The bytes live in the mailbox's Sent folder, not here. */
  attachments: jsonb("attachments").$type<Array<{ name: string; size: number; type: string }>>(),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/*
 * A books connection — provider-shaped, the way Collect holds its Xero and
 * QuickBooks connections. APX Ledger is provider #1; the provider column is
 * what keeps Reach from ever being hard-wired to one system.
 */
export const connections = pgTable("connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id).notNull(),
  provider: text("provider").notNull(), // apxledger | xero | quickbooks | …
  providerLabel: text("provider_label").notNull(),
  companyName: text("company_name").notNull(),
  externalCompanyId: text("external_company_id"),
  /*
   * The credential, in whichever shape the provider authenticates with.
   * OAuth providers (APX Ledger) fill the token trio; a provider that only
   * offers standing keys fills `credentials`. Both are held server-side and
   * never reach the browser — encrypting them at rest is the next hardening
   * step, tracked with the auth work.
   */
  credentials: text("credentials"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  baseCurrency: text("base_currency"),
  scopes: text("scopes"),
  status: text("status").default("connected").notNull(),
  /*
   * The provider's push subscription, when it offers one. Ledger signs each
   * ping with this secret, so it is the only thing that separates a real
   * "the books changed" from anyone who guessed the URL. Held like a token:
   * server-side, never in the browser, and dropped on disconnect.
   */
  webhookEndpointId: text("webhook_endpoint_id"),
  webhookSecret: text("webhook_secret"),
  webhookLastPingAt: timestamp("webhook_last_ping_at", { withTimezone: true }),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastSyncSummary: text("last_sync_summary"),
  lastSyncError: text("last_sync_error"),
});

/*
 * Sequences: a series of emails sent on a schedule from a person's own
 * mailbox, and the rule that makes them safe to automate — the series stops
 * on its own when the books say the invoice is paid, or when the customer
 * writes back. Nothing is ever sent to someone who was not enrolled by hand.
 */
export const sequences = pgTable("sequences", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id).notNull(),
  /** The starter this came from, so a workspace is seeded once and not again. */
  key: text("key"),
  name: text("name").notNull(),
  description: text("description").notNull(),
  kind: text("kind").default("collections").notNull(), // collections | relationship
  stopWhenPaid: boolean("stop_when_paid").default(true).notNull(),
  stopOnReply: boolean("stop_on_reply").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sequenceSteps = pgTable("sequence_steps", {
  id: uuid("id").defaultRandom().primaryKey(),
  sequenceId: uuid("sequence_id").references(() => sequences.id).notNull(),
  position: integer("position").notNull(),
  /** Days after enrolment. Day 0 goes out the moment someone is enrolled. */
  dayOffset: integer("day_offset").notNull(),
  templateKey: text("template_key").notNull(),
});

export const sequenceEnrollments = pgTable("sequence_enrollments", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id).notNull(),
  sequenceId: uuid("sequence_id").references(() => sequences.id).notNull(),
  contactId: uuid("contact_id").references(() => contacts.id).notNull(),
  companyId: uuid("company_id").references(() => companies.id),
  /** Whose mailbox the emails leave from — the person who enrolled them. */
  mailboxId: uuid("mailbox_id").references(() => mailboxes.id).notNull(),
  userId: text("user_id").notNull(),
  /** The invoice being chased, when there is one; what "paid" is checked against. */
  invoiceNumber: text("invoice_number"),
  status: text("status").default("active").notNull(), // active | completed | stopped
  stopReason: text("stop_reason"),
  nextPosition: integer("next_position").default(0).notNull(),
  nextDueAt: timestamp("next_due_at", { withTimezone: true }),
  sentCount: integer("sent_count").default(0).notNull(),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
  lastError: text("last_error"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

/*
 * Tickets: support work on the same stage engine as deals, in a pipeline of
 * its own kind. A ticket knows who raised it, what it was raised from (an
 * inbound email, when that is where it came from), and the two clocks a
 * service promise is measured by: first response and resolution.
 */
export const tickets = pgTable("tickets", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id).notNull(),
  pipelineId: uuid("pipeline_id").references(() => pipelines.id).notNull(),
  stageId: uuid("stage_id").references(() => pipelineStages.id).notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  priority: text("priority").default("normal").notNull(), // low | normal | high | urgent
  status: text("status").default("open").notNull(), // open | resolved
  companyId: uuid("company_id").references(() => companies.id),
  contactId: uuid("contact_id").references(() => contacts.id),
  ownerName: text("owner_name"),
  /** The inbound email this ticket was made from, so the Inbox can say so. */
  emailMessageId: uuid("email_message_id"),
  firstResponseDueAt: timestamp("first_response_due_at", { withTimezone: true }).notNull(),
  resolveDueAt: timestamp("resolve_due_at", { withTimezone: true }).notNull(),
  firstRespondedAt: timestamp("first_responded_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
