/*
 * The rules of membership, with no database in sight: what an invitation is
 * worth right now, and who may remove whom.
 */

export const roles = ["owner", "member"] as const;
export type Role = (typeof roles)[number];
export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (roles as readonly string[]).includes(value);
}

export const INVITE_DAYS = 14;

export type InviteLike = { expiresAt: Date; acceptedAt: Date | null; revokedAt: Date | null };

export function inviteStatus(invite: InviteLike, now: Date = new Date()): "pending" | "accepted" | "revoked" | "expired" {
  if (invite.acceptedAt) return "accepted";
  if (invite.revokedAt) return "revoked";
  if (invite.expiresAt <= now) return "expired";
  return "pending";
}

/** The invited address and the signed-in address have to be the same person. */
export function emailMatches(invited: string, actual: string): boolean {
  return invited.trim().toLowerCase() === actual.trim().toLowerCase();
}

export type MemberLike = { userId: string; role: string };

/**
 * Owners manage the team. Nobody removes the last owner — not even
 * themselves — because a workspace with no owner has nobody who can fix it.
 */
export function removalProblem(members: MemberLike[], actorId: string, targetId: string): string | null {
  const actor = members.find((member) => member.userId === actorId);
  if (!actor || actor.role !== "owner") return "Only an owner can remove people.";
  const target = members.find((member) => member.userId === targetId);
  if (!target) return "That person is not in this workspace.";
  const owners = members.filter((member) => member.role === "owner");
  if (target.role === "owner" && owners.length === 1) return "This workspace needs at least one owner. Make someone else an owner first.";
  return null;
}

export function roleChangeProblem(members: MemberLike[], actorId: string, targetId: string, role: Role): string | null {
  const actor = members.find((member) => member.userId === actorId);
  if (!actor || actor.role !== "owner") return "Only an owner can change roles.";
  const target = members.find((member) => member.userId === targetId);
  if (!target) return "That person is not in this workspace.";
  const owners = members.filter((member) => member.role === "owner");
  if (target.role === "owner" && role !== "owner" && owners.length === 1) return "This workspace needs at least one owner.";
  return null;
}
