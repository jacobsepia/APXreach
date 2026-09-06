import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, pipelineStages, pipelines, workspaceMembers, workspaces } from "@/db";

/*
 * Tenancy. Reach is open to anyone, so "which workspace" can never again be
 * "the first row in the table" — it is always derived from who is signed in.
 *
 * Every read and write in the app goes through a workspace id that came from
 * here, and every query filters on it. That is the whole isolation story: one
 * person's pipeline, contacts and books are invisible to every other tenant,
 * enforced at the query rather than in the UI.
 */

export interface Tenant {
  userId: string;
  userName: string;
  workspaceId: string;
  workspaceName: string;
}

/** The signed-in person, or null. */
async function currentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

/**
 * The workspace this request acts in. Redirects rather than throwing: an
 * unauthenticated visitor belongs at sign-in, and a signed-in person with no
 * workspace yet belongs at onboarding — neither is an error worth a stack
 * trace.
 */
export async function requireTenant(): Promise<Tenant> {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const [membership] = await db
    .select({ workspaceId: workspaceMembers.workspaceId, name: workspaces.name })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, user.id))
    .orderBy(asc(workspaceMembers.createdAt))
    .limit(1);

  if (!membership) redirect("/welcome");

  return {
    userId: user.id,
    userName: user.name,
    workspaceId: membership.workspaceId,
    workspaceName: membership.name,
  };
}

/** Same, for server actions: throws instead of redirecting mid-mutation. */
export async function requireTenantOrThrow(): Promise<Tenant> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const [membership] = await db
    .select({ workspaceId: workspaceMembers.workspaceId, name: workspaces.name })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, user.id))
    .orderBy(asc(workspaceMembers.createdAt))
    .limit(1);
  if (!membership) throw new Error("No workspace yet.");
  return {
    userId: user.id,
    userName: user.name,
    workspaceId: membership.workspaceId,
    workspaceName: membership.name,
  };
}

/** Does this person belong to any workspace yet? Used by onboarding. */
export async function hasWorkspace(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
    .limit(1);
  return Boolean(row);
}

/** URL-safe, collision-proof slug for a company name. */
async function uniqueSlug(name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "workspace";
  for (let attempt = 0; attempt < 50; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const [taken] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, slug))
      .limit(1);
    if (!taken) return slug;
  }
  return `${base}-${Date.now()}`;
}

/*
 * A new tenant starts with an empty CRM and one pipeline, because a pipeline
 * with no stages has nowhere to put a deal. No demo data: the first thing
 * someone sees should be their own emptiness, not a stranger's fake customers.
 */
const DEFAULT_STAGES = [
  { name: "New", displayOrder: 0, winProbability: 10, kind: "open" },
  { name: "Qualified", displayOrder: 1, winProbability: 30, kind: "open" },
  { name: "Proposal", displayOrder: 2, winProbability: 60, kind: "open" },
  { name: "Closed won", displayOrder: 3, winProbability: 100, kind: "won" },
  { name: "Closed lost", displayOrder: 4, winProbability: 0, kind: "lost" },
];

export async function createWorkspaceFor(
  userId: string,
  companyName: string,
): Promise<string> {
  const name = companyName.trim() || "My company";
  const [workspace] = await db
    .insert(workspaces)
    .values({ name, slug: await uniqueSlug(name) })
    .returning({ id: workspaces.id });

  await db.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId,
    role: "owner",
  });

  const [pipeline] = await db
    .insert(pipelines)
    .values({ workspaceId: workspace.id, name: "Sales pipeline", displayOrder: 0 })
    .returning({ id: pipelines.id });

  await db.insert(pipelineStages).values(
    DEFAULT_STAGES.map((stage) => ({ ...stage, pipelineId: pipeline.id })),
  );

  return workspace.id;
}

/** Guard for a record fetched by id: it must belong to this tenant. */
export function belongsTo(
  record: { workspaceId: string } | undefined,
  workspaceId: string,
): boolean {
  return Boolean(record) && record!.workspaceId === workspaceId;
}

export { and, eq };
