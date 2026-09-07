"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, mailboxes, workspaceInvites, workspaceMembers } from "@/db";
import { auth } from "@/lib/auth";
import { requireTenantOrThrow } from "@/lib/workspace";
import { sendFromMailbox } from "@/lib/mailbox/send";
import { acceptInvite, workspaceTeam } from "./team";
import { INVITE_DAYS, isRole, removalProblem, roleChangeProblem } from "./team-rules";

/*
 * Managing the team. Owners invite, change roles and remove; everyone else
 * only sees the list. The invitation email goes from the inviter's own
 * connected mailbox, the way everything else Reach sends does; with no
 * mailbox connected the link is shown to copy instead, so an invite never
 * silently fails to leave.
 */

async function requireOwner() {
  const tenant = await requireTenantOrThrow();
  const team = await workspaceTeam(tenant.workspaceId);
  const me = team.find((member) => member.userId === tenant.userId);
  if (!me || me.role !== "owner") throw new Error("Only an owner can manage the team.");
  return { tenant, team };
}

async function originFromHeaders(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "apxreach.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export type InviteOutcome = { ok: true; link: string; sent: boolean; message: string } | { ok: false; error: string };

export async function inviteMember(form: FormData): Promise<InviteOutcome> {
  try {
    const { tenant, team } = await requireOwner();
    const email = z.string().trim().email("Enter a valid email address.").max(254).parse(form.get("email")).toLowerCase();
    const role = form.get("role");
    if (!isRole(role)) return { ok: false, error: "Pick a role." };
    if (team.some((member) => member.email.toLowerCase() === email)) return { ok: false, error: `${email} is already a member.` };

    /* One open invitation per address: a re-invite refreshes the old one. */
    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
    const [open] = await db
      .select({ id: workspaceInvites.id })
      .from(workspaceInvites)
      .where(and(eq(workspaceInvites.workspaceId, tenant.workspaceId), eq(workspaceInvites.email, email), isNull(workspaceInvites.acceptedAt), isNull(workspaceInvites.revokedAt)))
      .limit(1);
    if (open) {
      await db.update(workspaceInvites).set({ token, role, expiresAt, invitedBy: tenant.userId, createdAt: new Date() }).where(eq(workspaceInvites.id, open.id));
    } else {
      await db.insert(workspaceInvites).values({ workspaceId: tenant.workspaceId, email, role, token, invitedBy: tenant.userId, expiresAt });
    }
    const link = `${await originFromHeaders()}/invite/${token}`;

    const [mailbox] = await db
      .select()
      .from(mailboxes)
      .where(and(eq(mailboxes.userId, tenant.userId), eq(mailboxes.workspaceId, tenant.workspaceId), eq(mailboxes.status, "connected")))
      .limit(1);
    let sent = false;
    if (mailbox) {
      const text = `${tenant.userName} has invited you to join ${tenant.workspaceName} on APX Reach.\n\nOpen this link, sign in or create an account with this address, and you're in:\n${link}\n\nThe link works for ${INVITE_DAYS} days.`;
      const html = `<p>${tenant.userName} has invited you to join <strong>${tenant.workspaceName}</strong> on APX Reach.</p><p>Open this link, sign in or create an account with this address, and you're in:</p><p><a href="${link}">${link}</a></p><p>The link works for ${INVITE_DAYS} days.</p>`;
      const outcome = await sendFromMailbox(mailbox, { to: email, subject: `Join ${tenant.workspaceName} on APX Reach`, text, html });
      sent = outcome.ok;
    }
    revalidatePath("/settings");
    return {
      ok: true,
      link,
      sent,
      message: sent
        ? `Invitation sent to ${email} from ${mailbox!.emailAddress}. It works for ${INVITE_DAYS} days.`
        : mailbox
          ? `The invitation is ready but the email did not send from ${mailbox.emailAddress}. Copy the link and send it yourself.`
          : "No mailbox is connected to send from, so copy the link and send it yourself.",
    };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: "Enter a valid email address." };
    return { ok: false, error: error instanceof Error ? error.message : "Could not create the invitation." };
  }
}

export async function revokeInvite(form: FormData): Promise<void> {
  const { tenant } = await requireOwner();
  const id = z.uuid().parse(form.get("inviteId"));
  await db.update(workspaceInvites).set({ revokedAt: new Date() }).where(and(eq(workspaceInvites.id, id), eq(workspaceInvites.workspaceId, tenant.workspaceId)));
  revalidatePath("/settings");
}

export async function removeMember(form: FormData): Promise<void> {
  const { tenant, team } = await requireOwner();
  const userId = z.string().min(1).parse(form.get("userId"));
  const problem = removalProblem(team, tenant.userId, userId);
  if (problem) throw new Error(problem);
  await db.delete(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, tenant.workspaceId), eq(workspaceMembers.userId, userId)));
  revalidatePath("/settings");
  if (userId === tenant.userId) redirect("/welcome");
}

export async function setMemberRole(form: FormData): Promise<void> {
  const { tenant, team } = await requireOwner();
  const userId = z.string().min(1).parse(form.get("userId"));
  const role = form.get("role");
  if (!isRole(role)) throw new Error("Pick a role.");
  const problem = roleChangeProblem(team, tenant.userId, userId, role);
  if (problem) throw new Error(problem);
  await db.update(workspaceMembers).set({ role }).where(and(eq(workspaceMembers.workspaceId, tenant.workspaceId), eq(workspaceMembers.userId, userId)));
  revalidatePath("/settings");
}

/** The welcome page's "Join" button. */
export async function acceptInviteAction(form: FormData): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const token = z.string().min(10).max(200).parse(form.get("token"));
  const outcome = await acceptInvite(token, session.user.id, session.user.email);
  if (!outcome.ok) redirect(`/welcome?error=${encodeURIComponent(outcome.error)}`);
  redirect("/dashboard?joined=1");
}
