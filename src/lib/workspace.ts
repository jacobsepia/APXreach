import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, workspaceMembers, workspaces } from "@/db";

/*
 * Which workspace the person is looking at.
 *
 * One account can belong to several: somebody who runs three businesses keeps
 * three sets of contacts, deals and books, and switches between them. The
 * choice lives in a cookie and is always checked against membership before it
 * is honoured, so a stale or hand-edited cookie falls back to the first
 * workspace they joined rather than opening somebody else's.
 */

export const ACTIVE_WORKSPACE_COOKIE = "apxreach_workspace";

/** Every workspace this account belongs to, oldest membership first. */
export const membershipsOf = cache(async (userId: string) =>
  db
    .select({ workspaceId: workspaces.id, workspaceName: workspaces.name, role: workspaceMembers.role, joinedAt: workspaceMembers.createdAt })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(asc(workspaceMembers.createdAt), asc(workspaces.id)),
);

const currentTenant = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { user: null, membership: null, all: [] };
  const all = await membershipsOf(session.user.id);
  if (!all.length) return { user: session.user, membership: null, all };
  const chosen = (await cookies()).get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const membership = all.find((row) => row.workspaceId === chosen) ?? all[0];
  return { user: session.user, membership, all };
});

export async function requireTenant() {
  const { user, membership, all } = await currentTenant();
  if (!user) redirect("/sign-in");
  if (!membership) redirect("/welcome");
  return { ...membership, userId: user.id, userName: user.name, workspaces: all };
}

export async function requireTenantOrThrow() {
  const { user, membership } = await currentTenant();
  if (!user) throw new Error("Not signed in.");
  if (!membership) throw new Error("Create your workspace first.");
  return { ...membership, userId: user.id, userName: user.name };
}

export async function hasWorkspace(userId: string) {
  return (await membershipsOf(userId)).length > 0;
}
