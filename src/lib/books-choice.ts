"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { getProvider, type OAuthTokens } from "@/lib/providers";
import { requireTenantOrThrow } from "@/lib/workspace";
import { connectableCompanies, saveConnection } from "@/lib/sync";

/*
 * Choosing which set of books a workspace takes, when the sign-in opened
 * several.
 *
 * The grant lives in the handshake cookie between the callback and the
 * choice: httpOnly, secure, ten minutes, and cleared the moment a company is
 * picked. It is the same class of secret as the PKCE verifier that sat there
 * a moment earlier, and it never reaches the page — the picker is rendered
 * from the company list alone.
 */

const PENDING_BOOKS_COOKIE = "apxreach_books_pending";
const TTL_SECONDS = 600;

type Pending = { provider: string; tokens: OAuthTokens; workspaceId: string };

const pendingSchema = z.object({
  provider: z.string().max(40),
  workspaceId: z.uuid(),
  tokens: z.object({
    accessToken: z.string(),
    refreshToken: z.string().nullable().optional(),
    expiresAt: z.union([z.string(), z.null()]).optional(),
    scopes: z.array(z.string()).default([]),
  }),
});

export async function stashPendingBooks(pending: Pending): Promise<void> {
  (await cookies()).set(PENDING_BOOKS_COOKIE, JSON.stringify(pending), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function clearPendingBooks(): Promise<void> {
  (await cookies()).set(PENDING_BOOKS_COOKIE, "", { path: "/", maxAge: 0 });
}

async function readPending(): Promise<{ provider: string; tokens: OAuthTokens; workspaceId: string } | null> {
  const raw = (await cookies()).get(PENDING_BOOKS_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = pendingSchema.parse(JSON.parse(raw));
    return {
      provider: parsed.provider,
      workspaceId: parsed.workspaceId,
      tokens: {
        accessToken: parsed.tokens.accessToken,
        refreshToken: parsed.tokens.refreshToken ?? null,
        expiresAt: parsed.tokens.expiresAt ? new Date(parsed.tokens.expiresAt) : null,
        scopes: parsed.tokens.scopes,
      } as OAuthTokens,
    };
  } catch {
    return null;
  }
}

/** What the picker page shows: the companies this grant opens, for this workspace. */
export async function pendingBooksChoice(): Promise<
  { ok: true; providerLabel: string; companies: Array<{ externalId: string; name: string; currency: string }> } | { ok: false; error: string }
> {
  const tenant = await requireTenantOrThrow();
  const pending = await readPending();
  if (!pending) return { ok: false, error: "That connection attempt has expired. Start it again from Settings." };
  if (pending.workspaceId !== tenant.workspaceId) {
    return { ok: false, error: "That connection was started for a different workspace. Switch back to it, or start again here." };
  }
  const provider = getProvider(pending.provider);
  if (!provider) return { ok: false, error: "That provider is no longer available." };
  const available = await connectableCompanies(provider, pending.tokens.accessToken);
  if (!available.ok) return { ok: false, error: available.error };
  return {
    ok: true,
    providerLabel: provider.label,
    companies: available.value.map((company) => ({ externalId: company.externalId, name: company.name, currency: company.currency })),
  };
}

export async function chooseBooksCompany(form: FormData): Promise<void> {
  const tenant = await requireTenantOrThrow();
  const externalCompanyId = z.string().trim().min(1).max(200).parse(form.get("externalCompanyId"));
  const pending = await readPending();
  if (!pending || pending.workspaceId !== tenant.workspaceId) {
    await clearPendingBooks();
    redirect("/settings?error=" + encodeURIComponent("That connection attempt expired. Start it again."));
  }
  const provider = getProvider(pending.provider);
  if (!provider) {
    await clearPendingBooks();
    redirect("/settings?error=" + encodeURIComponent("That provider is no longer available."));
  }
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "apxreach.vercel.app";
  const origin = `${requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;

  const saved = await saveConnection(tenant.workspaceId, provider, pending.tokens, origin, externalCompanyId);
  await clearPendingBooks();
  revalidatePath("/", "layout");
  redirect(saved.ok ? "/settings?connected=1" : `/settings?error=${encodeURIComponent(saved.error)}`);
}

export async function cancelBooksChoice(): Promise<void> {
  await clearPendingBooks();
  redirect("/settings");
}
