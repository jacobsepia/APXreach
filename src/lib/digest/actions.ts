"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, workspaceMembers } from "@/db";
import { requireTenantOrThrow } from "@/lib/workspace";
import { sendDigestTo } from "./run";

export async function setDigestEnabled(form: FormData): Promise<void> {
  const { workspaceId, userId } = await requireTenantOrThrow();
  const enabled = form.get("enabled") === "on";
  await db.update(workspaceMembers).set({ digestEnabled: enabled }).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
  revalidatePath("/settings");
}

/** "Send me today's digest" — even on a quiet day, so the person can see what it looks like. */
export async function sendDigestNow(): Promise<void> {
  const { workspaceId, userId } = await requireTenantOrThrow();
  const outcome = await sendDigestTo(workspaceId, userId, new Date(), true);
  redirect(`/settings?${outcome.result === "sent" ? `digest=${encodeURIComponent(outcome.detail)}` : `error=${encodeURIComponent(`Digest not sent: ${outcome.detail}`)}`}`);
}
