"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, mailboxes, workspaces } from "@/db";
import { requireTenantOrThrow } from "./workspace";
import { emailSignature } from "./email-signature";
import { rewriteDraft, ToneError } from "./email-tone";
import { isTone } from "./email-tone-list";

/*
 * The server side of the tone pills. The OpenAI key lives here and only here:
 * it is read from the environment per request and never returned, logged, or
 * sent to the browser. A workspace gets a daily allowance of rewrites so a
 * stuck button or a curious teammate cannot run up a bill overnight.
 */

const DEFAULT_MODEL = "gpt-4.1-mini";
const DEFAULT_DAILY_LIMIT = 200;

async function toneResult<T>(run: () => Promise<T>): Promise<{ data: T; error?: never } | { error: string; data?: never }> {
  try {
    return { data: await run() };
  } catch (error) {
    if (error instanceof ToneError) return { error: error.message };
    if (error instanceof z.ZodError) return { error: "That draft could not be read. Your draft is unchanged." };
    console.error("[email-tone]", error);
    return { error: "Could not rewrite right now. Check your sign-in and try again; your draft is unchanged." };
  }
}

/**
 * Count this rewrite against today's allowance, atomically. The row only
 * updates while there is allowance left, so a workspace at the limit gets no
 * row back and no call is made.
 */
async function reserveRewrite(workspaceId: string): Promise<void> {
  const limit = Math.max(1, Number(process.env.EMAIL_REWRITE_DAILY_LIMIT) || DEFAULT_DAILY_LIMIT);
  const reserved = await db
    .update(workspaces)
    .set({
      rewriteCount: sql`CASE WHEN ${workspaces.rewriteCountDay} = CURRENT_DATE THEN ${workspaces.rewriteCount} + 1 ELSE 1 END`,
      rewriteCountDay: sql`CURRENT_DATE`,
    })
    .where(
      and(
        eq(workspaces.id, workspaceId),
        sql`(${workspaces.rewriteCountDay} IS DISTINCT FROM CURRENT_DATE OR ${workspaces.rewriteCount} < ${limit})`,
      ),
    )
    .returning({ count: workspaces.rewriteCount });
  if (!reserved.length) {
    throw new ToneError(`This workspace has used today's ${limit} rewrites. The allowance resets at midnight UTC.`);
  }
}

export async function rewriteEmailTone(form: FormData) {
  return toneResult(async () => {
    const tenant = await requireTenantOrThrow();

    const tone = form.get("tone");
    if (!isTone(tone)) throw new ToneError("Pick one of the four tones.");
    const bodyHtml = z.string().max(200_000).parse(form.get("bodyHtml"));
    const contactName = z.string().max(200).parse(form.get("contactName") ?? "");

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new ToneError("Tone rewriting is not set up yet. Add OPENAI_API_KEY to the server's environment variables.");
    const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;

    /* The signature is built from the same facts the composer used, so the split lands on the real sign-off. */
    const [mailbox] = await db
      .select({ emailAddress: mailboxes.emailAddress })
      .from(mailboxes)
      .where(and(eq(mailboxes.userId, tenant.userId), eq(mailboxes.workspaceId, tenant.workspaceId), eq(mailboxes.status, "connected")))
      .limit(1);
    const signature = emailSignature(tenant.userName, tenant.workspaceName, mailbox?.emailAddress ?? "");

    await reserveRewrite(tenant.workspaceId);

    const names = contactName.split(/\s+/).filter((part) => part.length > 1);
    return rewriteDraft(
      { tone, bodyHtml, senderName: tenant.userName, names: [contactName, ...names, signature.text.split("\n")[0] ?? ""] },
      { apiKey, model },
    );
  });
}
