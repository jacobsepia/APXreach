"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  activities,
  companies,
  contacts,
  db,
  deals,
  ledgerConnections,
  pipelineStages,
  workspaces,
} from "@/db";
import { connectToLedger, runLedgerSync } from "@/lib/ledger";

/*
 * Phase 1 mutations, as server actions. One workspace for now — the actions
 * resolve it themselves; when auth lands this becomes the session's workspace
 * and these functions grow an authorization check at the top.
 */

async function workspaceId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Not signed in.");
  const [ws] = await db.select({ id: workspaces.id }).from(workspaces).limit(1);
  if (!ws) throw new Error("No workspace yet — run the seed or create one.");
  return ws.id;
}

/** The signed-in person's name, for timeline attribution. */
async function actorName(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.name ?? "Reach";
}

const trimmed = z.string().trim();
const optionalText = trimmed.transform((v) => (v === "" ? null : v));
/** "12,500" or "12500.50" → integer cents; empty → 0. */
function toCents(raw: FormDataEntryValue | null): number {
  const cleaned = String(raw ?? "").replace(/[$,\s]/g, "");
  if (cleaned === "") return 0;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) throw new Error("Amount must be a number.");
  return Math.round(value * 100);
}

export async function createCompany(formData: FormData): Promise<void> {
  const wsId = await workspaceId();
  const name = trimmed.min(1, "Name is required.").parse(formData.get("name"));
  const [row] = await db
    .insert(companies)
    .values({
      workspaceId: wsId,
      name,
      domain: optionalText.parse(formData.get("domain") ?? ""),
      city: optionalText.parse(formData.get("city") ?? ""),
      industry: optionalText.parse(formData.get("industry") ?? ""),
      lifecycleStage: trimmed.parse(formData.get("lifecycleStage") ?? "lead") || "lead",
      ownerName: optionalText.parse(formData.get("ownerName") ?? ""),
      source: optionalText.parse(formData.get("source") ?? ""),
    })
    .returning({ id: companies.id });
  revalidatePath("/companies");
  redirect(`/companies/${row.id}`);
}

export async function createContact(formData: FormData): Promise<void> {
  const wsId = await workspaceId();
  const firstName = trimmed.min(1, "First name is required.").parse(formData.get("firstName"));
  const lastName = trimmed.parse(formData.get("lastName") ?? "") || "—";
  const companyId = optionalText.parse(formData.get("companyId") ?? "");
  await db.insert(contacts).values({
    workspaceId: wsId,
    firstName,
    lastName,
    email: optionalText.parse(formData.get("email") ?? ""),
    phone: optionalText.parse(formData.get("phone") ?? ""),
    title: optionalText.parse(formData.get("title") ?? ""),
    companyId: companyId || null,
    lifecycleStage: trimmed.parse(formData.get("lifecycleStage") ?? "lead") || "lead",
    ownerName: optionalText.parse(formData.get("ownerName") ?? ""),
    lastActivityAt: new Date(),
  });
  revalidatePath("/contacts");
  redirect("/contacts");
}

export async function createDeal(formData: FormData): Promise<void> {
  const wsId = await workspaceId();
  const name = trimmed.min(1, "Deal name is required.").parse(formData.get("name"));
  const stageId = trimmed.min(1, "Pick a stage.").parse(formData.get("stageId"));
  const [stage] = await db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.id, stageId));
  if (!stage) throw new Error("Unknown stage.");
  const companyId = optionalText.parse(formData.get("companyId") ?? "");
  await db.insert(deals).values({
    workspaceId: wsId,
    name,
    pipelineId: stage.pipelineId,
    stageId,
    companyId: companyId || null,
    amountCents: toCents(formData.get("amount")),
    closeDate: optionalText.parse(formData.get("closeDate") ?? ""),
    ownerName: optionalText.parse(formData.get("ownerName") ?? ""),
    status: stage.kind === "won" ? "won" : stage.kind === "lost" ? "lost" : "open",
    wonAt: stage.kind === "won" ? new Date() : null,
  });
  revalidatePath("/deals");
  redirect("/deals");
}

export async function createTask(formData: FormData): Promise<void> {
  const wsId = await workspaceId();
  const subject = trimmed.min(1, "The task needs a description.").parse(formData.get("subject"));
  const dueRaw = optionalText.parse(formData.get("dueAt") ?? "");
  const companyId = optionalText.parse(formData.get("companyId") ?? "");
  await db.insert(activities).values({
    workspaceId: wsId,
    type: "task",
    subject,
    companyId: companyId || null,
    dueAt: dueRaw ? new Date(dueRaw) : null,
    actorName: optionalText.parse(formData.get("ownerName") ?? "") ?? (await actorName()),
  });
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  redirect("/tasks");
}

export async function completeTask(formData: FormData): Promise<void> {
  const id = trimmed.min(1).parse(formData.get("taskId"));
  await db
    .update(activities)
    .set({ completedAt: new Date() })
    .where(eq(activities.id, id));
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

export async function logActivity(formData: FormData): Promise<void> {
  const wsId = await workspaceId();
  const companyId = trimmed.min(1).parse(formData.get("companyId"));
  const type = z.enum(["note", "call", "email", "meeting"]).parse(formData.get("type"));
  const body = trimmed.min(1, "Write something first.").parse(formData.get("body"));
  const labels = { note: "Note", call: "Call logged", email: "Email logged", meeting: "Meeting" };
  await db.insert(activities).values({
    workspaceId: wsId,
    type,
    subject: labels[type],
    body,
    companyId,
    actorName: await actorName(),
    occurredAt: new Date(),
  });
  await db
    .update(contacts)
    .set({ lastActivityAt: new Date() })
    .where(eq(contacts.companyId, companyId));
  revalidatePath(`/companies/${companyId}`);
}

export async function setDealStage(formData: FormData): Promise<void> {
  const dealId = trimmed.min(1).parse(formData.get("dealId"));
  const stageId = trimmed.min(1).parse(formData.get("stageId"));
  const [stage] = await db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.id, stageId));
  if (!stage) throw new Error("Unknown stage.");
  await db
    .update(deals)
    .set({
      stageId,
      status: stage.kind === "won" ? "won" : stage.kind === "lost" ? "lost" : "open",
      wonAt: stage.kind === "won" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(deals.id, dealId));
  revalidatePath("/deals");
  revalidatePath("/dashboard");
}

export async function connectLedger(formData: FormData): Promise<void> {
  const wsId = await workspaceId();
  const apiKey = trimmed.min(1, "Paste the API key.").parse(formData.get("apiKey"));
  const result = await connectToLedger(wsId, apiKey);
  revalidatePath("/settings");
  if (!result.ok) {
    redirect(`/settings?error=${encodeURIComponent(result.error)}`);
  }
  redirect("/settings");
}

export async function syncLedgerNow(): Promise<void> {
  const wsId = await workspaceId();
  await runLedgerSync(wsId);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/companies");
  revalidatePath("/contacts");
}

export async function disconnectLedger(): Promise<void> {
  const wsId = await workspaceId();
  await db
    .update(ledgerConnections)
    .set({ status: "disconnected", apiKey: null })
    .where(eq(ledgerConnections.workspaceId, wsId));
  revalidatePath("/settings");
}
