"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { ACTIVE_WORKSPACE_COOKIE, membershipsOf } from "@/lib/workspace";
import { provisionWorkspace } from "@/lib/workspace-store";

/*
 * Switching between the workspaces an account belongs to, and adding another.
 * The cookie only ever holds a workspace this person is actually in — it is
 * checked here on the way in and again on every read.
 */

export async function switchWorkspace(form: FormData): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const workspaceId = z.uuid().parse(form.get("workspaceId"));
  const mine = await membershipsOf(session.user.id);
  if (!mine.some((row) => row.workspaceId === workspaceId)) redirect("/dashboard");
  (await cookies()).set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/dashboard");
}

/**
 * A second business. Same account, its own contacts, deals, pipeline and
 * books connection — and the switcher lands on it straight away.
 */
export async function addWorkspace(form: FormData): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const parsed = z.string().trim().min(1).max(80).safeParse(form.get("companyName"));
  if (!parsed.success) redirect("/settings?error=Enter+a+company+name+of+1-80+characters.");
  const workspaceId = await provisionWorkspace(session.user.id, parsed.data, { always: true });
  (await cookies()).set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
  redirect("/settings?created=1");
}
