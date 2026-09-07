"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { activities, campaignRecipients, campaigns, contacts, db, mailboxes, tags } from "@/db";
import { requireTenantOrThrow } from "@/lib/workspace";
import { sanitizeEmailHtml } from "@/lib/email-content";
import { audienceCandidates, campaignById, previewAudience } from "./store";
import { buildAudience, footerHtml, footerText } from "./audience";
import { bulkSendingHint, bulkSendingReady, htmlToPlain, resendSender } from "./send";
import { oneClickUnsubscribeUrl, unsubscribeUrl } from "./unsubscribe";

/*
 * Creating, editing and sending a campaign. Sending is a deliberate act by a
 * signed-in person and happens once: the campaign is claimed by moving it to
 * "sending" only from "draft", so a double-click or a second tab cannot send
 * the list twice.
 */

const nameSchema = z.string().trim().min(1, "Give the campaign a name.").max(120);

async function appUrl(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "apxreach.vercel.app";
  const proto = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function createCampaign(form: FormData): Promise<void> {
  const tenant = await requireTenantOrThrow();
  const name = nameSchema.parse(form.get("name"));
  const [mailbox] = await db
    .select({ emailAddress: mailboxes.emailAddress })
    .from(mailboxes)
    .where(and(eq(mailboxes.userId, tenant.userId), eq(mailboxes.workspaceId, tenant.workspaceId), eq(mailboxes.status, "connected")))
    .limit(1);
  const [created] = await db
    .insert(campaigns)
    .values({
      workspaceId: tenant.workspaceId,
      name,
      subject: name,
      bodyHtml: "<p></p>",
      fromName: tenant.workspaceName,
      fromEmail: process.env.RESEND_FROM?.trim() || mailbox?.emailAddress || "",
      replyTo: mailbox?.emailAddress ?? null,
      createdBy: tenant.userId,
    })
    .returning({ id: campaigns.id });
  revalidatePath("/campaigns");
  redirect(`/campaigns/${created.id}`);
}

export async function updateCampaign(form: FormData): Promise<void> {
  const tenant = await requireTenantOrThrow();
  const id = z.uuid().parse(form.get("campaignId"));
  const campaign = await campaignById(tenant.workspaceId, id);
  if (!campaign) throw new Error("Campaign unavailable.");
  if (campaign.status !== "draft") throw new Error("A campaign that has been sent cannot be edited.");

  const tagId = z.string().trim().parse(form.get("tagId") ?? "");
  if (tagId) {
    const [tag] = await db.select({ id: tags.id }).from(tags).where(and(eq(tags.id, z.uuid().parse(tagId)), eq(tags.workspaceId, tenant.workspaceId))).limit(1);
    if (!tag) throw new Error("That list is not in this workspace.");
  }
  await db
    .update(campaigns)
    .set({
      name: nameSchema.parse(form.get("name")),
      subject: z.string().trim().min(1, "Give it a subject.").max(998).regex(/^[^\r\n]+$/).parse(form.get("subject")),
      bodyHtml: sanitizeEmailHtml(z.string().max(200_000).parse(form.get("bodyHtml"))),
      tagId: tagId || null,
      fromName: z.string().trim().min(1).max(120).parse(form.get("fromName")),
      replyTo: z.string().trim().max(254).parse(form.get("replyTo") ?? "") || null,
      holdDunning: form.get("holdDunning") === "on",
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, id));
  revalidatePath(`/campaigns/${id}`);
  revalidatePath("/campaigns");
}

/**
 * The same save, for the editor's own Save button and for the moment before a
 * send: it answers rather than throwing, so the page can say what is wrong
 * beside the field instead of showing a server-error screen.
 */
export async function saveCampaign(form: FormData): Promise<{ error?: string }> {
  try {
    await updateCampaign(form);
    return {};
  } catch (caught) {
    if (caught instanceof z.ZodError) return { error: caught.issues[0]?.message ?? "Check the campaign details." };
    return { error: caught instanceof Error ? caught.message : "Could not save the campaign." };
  }
}

/** Who this would reach right now — recomputed as the list or the dunning rule changes. */
export async function previewCampaignAudience(form: FormData): Promise<{ send: number; held: Array<{ name: string; reason: string }> }> {
  const tenant = await requireTenantOrThrow();
  const tagId = z.string().trim().parse(form.get("tagId") ?? "");
  const { send, held } = await previewAudience(tenant.workspaceId, tagId || null, form.get("holdDunning") === "on");
  return { send: send.length, held: held.map((person) => ({ name: person.name, reason: person.reason })) };
}

export async function deleteCampaign(form: FormData): Promise<void> {
  const tenant = await requireTenantOrThrow();
  const id = z.uuid().parse(form.get("campaignId"));
  const campaign = await campaignById(tenant.workspaceId, id);
  if (!campaign) return;
  await db.delete(campaignRecipients).where(eq(campaignRecipients.campaignId, id));
  await db.delete(campaigns).where(eq(campaigns.id, id));
  revalidatePath("/campaigns");
  redirect("/campaigns");
}

/**
 * Send it. The audience is rebuilt here rather than trusted from the page,
 * so a balance that went overdue while somebody was writing still holds that
 * account back.
 */
export async function sendCampaign(form: FormData): Promise<void> {
  const tenant = await requireTenantOrThrow();
  const id = z.uuid().parse(form.get("campaignId"));
  const campaign = await campaignById(tenant.workspaceId, id);
  if (!campaign) throw new Error("Campaign unavailable.");

  const fail = async (message: string) => {
    await db.update(campaigns).set({ status: "draft", lastError: message }).where(eq(campaigns.id, id));
    revalidatePath(`/campaigns/${id}`);
    redirect(`/campaigns/${id}?error=${encodeURIComponent(message)}`);
  };

  if (!bulkSendingReady()) return fail(bulkSendingHint()!);
  if (!campaign.tagId) return fail("Choose the list this goes to first.");
  if (!htmlToPlain(campaign.bodyHtml)) return fail("Write the email before sending it.");

  /* Claim it: only a draft becomes "sending", so a second click sends nothing. */
  const claimed = await db
    .update(campaigns)
    .set({ status: "sending", lastError: null })
    .where(and(eq(campaigns.id, id), eq(campaigns.status, "draft")))
    .returning({ id: campaigns.id });
  if (!claimed.length) return fail("That campaign has already been sent, or is sending now.");

  const { send, held } = buildAudience(await audienceCandidates(tenant.workspaceId, campaign.tagId), { holdDunning: campaign.holdDunning });
  if (!send.length) {
    await db.update(campaigns).set({ status: "draft", heldCount: held.length, lastError: "Nobody on that list can be sent to right now." }).where(eq(campaigns.id, id));
    return fail("Nobody on that list can be sent to right now — see who is held back below.");
  }

  await db.delete(campaignRecipients).where(eq(campaignRecipients.campaignId, id));
  if (held.length) {
    await db.insert(campaignRecipients).values(
      held.map((person) => ({ campaignId: id, contactId: person.contactId, email: "", status: "held" as const, reason: person.reason })),
    ).onConflictDoNothing();
  }

  const base = await appUrl();
  const sender = resendSender();
  const now = new Date();
  let sent = 0;
  let failed = 0;
  let lastError: string | null = null;

  for (const person of send) {
    const unsubscribe = unsubscribeUrl(base, person.contactId);
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#302b36">${campaign.bodyHtml}${footerHtml({ workspaceName: campaign.fromName, fromEmail: campaign.replyTo ?? sender.from, unsubscribeUrl: unsubscribe })}</div>`;
    const text = htmlToPlain(campaign.bodyHtml) + footerText({ workspaceName: campaign.fromName, fromEmail: campaign.replyTo ?? sender.from, unsubscribeUrl: unsubscribe });
    const outcome = await sender.send({ to: person.email, subject: campaign.subject, html, text, replyTo: campaign.replyTo, oneClickUrl: oneClickUnsubscribeUrl(base, person.contactId) });
    if (outcome.ok) {
      sent++;
      await db.insert(campaignRecipients).values({ campaignId: id, contactId: person.contactId, email: person.email, status: "sent", providerMessageId: outcome.id, sentAt: new Date() }).onConflictDoNothing();
    } else {
      failed++;
      lastError = outcome.error;
      await db.insert(campaignRecipients).values({ campaignId: id, contactId: person.contactId, email: person.email, status: "failed", reason: outcome.error }).onConflictDoNothing();
    }
  }

  await db
    .update(campaigns)
    .set({ status: failed && !sent ? "failed" : "sent", sentCount: sent, failedCount: failed, heldCount: held.length, sentAt: now, lastError, updatedAt: new Date() })
    .where(eq(campaigns.id, id));
  await db.insert(activities).values({
    workspaceId: tenant.workspaceId,
    type: "email",
    source: "reach",
    subject: `Campaign sent — ${campaign.name}`,
    body: `${sent} sent${failed ? `, ${failed} failed` : ""}${held.length ? `, ${held.length} held back` : ""}.`,
    actorName: tenant.userName,
    occurredAt: now,
  });
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${id}`);
  redirect(`/campaigns/${id}?sent=1`);
}

/** Put somebody back on the list, from their record — an unsubscribe they asked to undo. */
export async function resubscribeContact(form: FormData): Promise<void> {
  const tenant = await requireTenantOrThrow();
  const contactId = z.uuid().parse(form.get("contactId"));
  await db
    .update(contacts)
    .set({ unsubscribedAt: null, updatedAt: new Date() })
    .where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, tenant.workspaceId)));
  revalidatePath("/contacts");
}
