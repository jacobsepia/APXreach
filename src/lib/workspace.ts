import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, workspaceMembers, workspaces } from "@/db";

const currentTenant = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { user: null, membership: null };
  const [membership] = await db.select({ workspaceId: workspaces.id, workspaceName: workspaces.name })
    .from(workspaceMembers).innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, session.user.id))
    .orderBy(asc(workspaceMembers.createdAt), asc(workspaceMembers.id)).limit(1);
  return { user: session.user, membership: membership ?? null };
});

export async function requireTenant() {
  const { user, membership } = await currentTenant();
  if (!user) redirect("/sign-in");
  if (!membership) redirect("/welcome");
  return { ...membership, userId: user.id, userName: user.name };
}

export async function requireTenantOrThrow() {
  const { user, membership } = await currentTenant();
  if (!user) throw new Error("Not signed in.");
  if (!membership) throw new Error("Create your workspace first.");
  return { ...membership, userId: user.id, userName: user.name };
}

export async function hasWorkspace(userId: string) {
  const [row] = await db.select({ id: workspaceMembers.id }).from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId)).limit(1);
  return Boolean(row);
}
