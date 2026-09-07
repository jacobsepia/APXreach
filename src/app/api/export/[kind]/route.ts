import { and, asc, eq } from "drizzle-orm";
import { companies, contacts, db, deals, pipelineStages } from "@/db";
import { requireTenantOrThrow } from "@/lib/workspace";
import { toCsv } from "@/lib/csv";

/*
 * Your data, as a file. Contacts, companies or deals for the signed-in
 * person's workspace, as CSV, the way a spreadsheet opens it. Nothing here
 * is a secret to the person downloading it; it is their own records.
 */

export const dynamic = "force-dynamic";

const money = (cents: number) => (cents / 100).toFixed(2);

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  let tenant;
  try {
    tenant = await requireTenantOrThrow();
  } catch {
    return new Response("Sign in first.", { status: 401 });
  }
  const { workspaceId } = tenant;
  const today = new Date().toISOString().slice(0, 10);

  let body: string;
  if (kind === "contacts") {
    const rows = await db
      .select({ firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email, phone: contacts.phone, title: contacts.title, company: companies.name, stage: contacts.lifecycleStage, owner: contacts.ownerName, lastActivityAt: contacts.lastActivityAt, createdAt: contacts.createdAt })
      .from(contacts)
      .leftJoin(companies, eq(contacts.companyId, companies.id))
      .where(eq(contacts.workspaceId, workspaceId))
      .orderBy(asc(contacts.lastName), asc(contacts.firstName));
    body = toCsv(
      ["First name", "Last name", "Email", "Phone", "Title", "Company", "Stage", "Owner", "Last activity", "Created"],
      rows.map((row) => [row.firstName, row.lastName === "—" ? "" : row.lastName, row.email, row.phone, row.title, row.company, row.stage, row.owner, row.lastActivityAt?.toISOString() ?? "", row.createdAt.toISOString()]),
    );
  } else if (kind === "companies") {
    const rows = await db
      .select()
      .from(companies)
      .where(eq(companies.workspaceId, workspaceId))
      .orderBy(asc(companies.name));
    body = toCsv(
      ["Name", "Domain", "City", "Industry", "Stage", "Owner", "Source", "Receivable (CAD)", "Overdue (CAD)", "Revenue YTD (CAD)", "Created"],
      rows.map((row) => [row.name, row.domain, row.city, row.industry, row.lifecycleStage, row.ownerName, row.source, money(row.arBalanceCents), money(row.overdueCents), money(row.revenueYtdCents), row.createdAt.toISOString()]),
    );
  } else if (kind === "deals") {
    const rows = await db
      .select({ name: deals.name, company: companies.name, stage: pipelineStages.name, status: deals.status, amountCents: deals.amountCents, closeDate: deals.closeDate, wonAt: deals.wonAt, lostReason: deals.lostReason, owner: deals.ownerName, invoice: deals.ledgerInvoiceNumber, createdAt: deals.createdAt })
      .from(deals)
      .leftJoin(companies, eq(deals.companyId, companies.id))
      .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
      .where(and(eq(deals.workspaceId, workspaceId)))
      .orderBy(asc(deals.createdAt));
    body = toCsv(
      ["Deal", "Company", "Stage", "Status", "Amount (CAD)", "Close date", "Won at", "Reason lost", "Owner", "Invoice", "Created"],
      rows.map((row) => [row.name, row.company, row.stage, row.status, money(row.amountCents), row.closeDate, row.wonAt?.toISOString() ?? "", row.lostReason, row.owner, row.invoice, row.createdAt.toISOString()]),
    );
  } else {
    return new Response("Unknown export.", { status: 404 });
  }

  return new Response("﻿" + body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="reach-${kind}-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
