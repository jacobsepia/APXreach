import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db, user, workspaceInvites, workspaceMembers, workspaces } from "@/db";
import { emailMatches, inviteStatus } from "./team-rules";

/* Reading the team. Writes live in team-actions.ts. */

export async function workspaceTeam(workspaceId: string) {
  return db
    .select({ userId: workspaceMembers.userId, role: workspaceMembers.role, joinedAt: workspaceMembers.createdAt, name: user.name, email: user.email })
    .from(workspaceMembers)
    .innerJoin(user, eq(user.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(asc(workspaceMembers.createdAt));
}

/** Just the names, for the owner dropdowns on every record form. */
export async function memberNames(workspaceId: string): Promise<string[]> {
  const rows = await db
    .select({ name: user.name })
    .from(workspaceMembers)
    .innerJoin(user, eq(user.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(asc(workspaceMembers.createdAt));
  return [...new Set(rows.map((row) => row.name.trim()).filter(Boolean))];
}

export async function pendingInvites(workspaceId: string) {
  const rows = await db
    .select({ id: workspaceInvites.id, email: workspaceInvites.email, role: workspaceInvites.role, token: workspaceInvites.token, createdAt: workspaceInvites.createdAt, expiresAt: workspaceInvites.expiresAt, acceptedAt: workspaceInvites.acceptedAt, revokedAt: workspaceInvites.revokedAt, invitedBy: user.name })
    .from(workspaceInvites)
    .leftJoin(user, eq(user.id, workspaceInvites.invitedBy))
    .where(and(eq(workspaceInvites.workspaceId, workspaceId), isNull(workspaceInvites.acceptedAt), isNull(workspaceInvites.revokedAt)))
    .orderBy(desc(workspaceInvites.createdAt));
  return rows.map((row) => ({ ...row, status: inviteStatus(row) }));
}

/** Invitations waiting for this address, across workspaces — what the welcome page offers to join. */
export async function invitesForEmail(email: string) {
  const rows = await db
    .select({ id: workspaceInvites.id, token: workspaceInvites.token, role: workspaceInvites.role, expiresAt: workspaceInvites.expiresAt, acceptedAt: workspaceInvites.acceptedAt, revokedAt: workspaceInvites.revokedAt, workspaceId: workspaces.id, workspaceName: workspaces.name, invitedBy: user.name })
    .from(workspaceInvites)
    .innerJoin(workspaces, eq(workspaces.id, workspaceInvites.workspaceId))
    .leftJoin(user, eq(user.id, workspaceInvites.invitedBy))
    .where(and(sql`lower(${workspaceInvites.email}) = ${email.trim().toLowerCase()}`, isNull(workspaceInvites.acceptedAt), isNull(workspaceInvites.revokedAt)))
    .orderBy(desc(workspaceInvites.createdAt));
  return rows.filter((row) => inviteStatus(row) === "pending");
}

export type AcceptOutcome = { ok: true; workspaceId: string; workspaceName: string; alreadyMember: boolean } | { ok: false; error: string };

/**
 * Turn a token into a membership. The signed-in address must be the invited
 * one, the invitation must still be open, and a person who already belongs
 * somewhere else cannot be in two places — this app shows one workspace.
 */
export async function acceptInvite(token: string, userId: string, userEmail: string): Promise<AcceptOutcome> {
  const [invite] = await db
    .select({ id: workspaceInvites.id, email: workspaceInvites.email, role: workspaceInvites.role, workspaceId: workspaceInvites.workspaceId, expiresAt: workspaceInvites.expiresAt, acceptedAt: workspaceInvites.acceptedAt, revokedAt: workspaceInvites.revokedAt, workspaceName: workspaces.name })
    .from(workspaceInvites)
    .innerJoin(workspaces, eq(workspaces.id, workspaceInvites.workspaceId))
    .where(eq(workspaceInvites.token, token))
    .limit(1);
  if (!invite) return { ok: false, error: "This invitation link is not valid." };

  const [existing] = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, invite.workspaceId)))
    .limit(1);
  if (existing) return { ok: true, workspaceId: invite.workspaceId, workspaceName: invite.workspaceName, alreadyMember: true };

  const status = inviteStatus(invite);
  if (status === "accepted") return { ok: false, error: "This invitation has already been used." };
  if (status === "revoked") return { ok: false, error: "This invitation was withdrawn." };
  if (status === "expired") return { ok: false, error: "This invitation has expired. Ask for a new one." };
  if (!emailMatches(invite.email, userEmail)) {
    return { ok: false, error: `This invitation was sent to ${invite.email}. Sign in with that address to accept it.` };
  }
  const [elsewhere] = await db.select({ id: workspaceMembers.id }).from(workspaceMembers).where(eq(workspaceMembers.userId, userId)).limit(1);
  if (elsewhere) {
    return { ok: false, error: "This account already belongs to another workspace. Reach shows one workspace per account; use a different address for this one." };
  }

  await db.insert(workspaceMembers).values({ workspaceId: invite.workspaceId, userId, role: invite.role });
  await db.update(workspaceInvites).set({ acceptedAt: new Date(), acceptedBy: userId }).where(eq(workspaceInvites.id, invite.id));
  return { ok: true, workspaceId: invite.workspaceId, workspaceName: invite.workspaceName, alreadyMember: false };
}
