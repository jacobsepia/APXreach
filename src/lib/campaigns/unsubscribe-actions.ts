"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { applyResubscribe, applyUnsubscribe } from "./unsubscribe-store";

/*
 * The two buttons on the public unsubscribe page. No session — the signed
 * token is the whole authority — so these do nothing more than the one thing
 * the token names.
 */

const tokenSchema = z.string().trim().min(3).max(400);

export async function unsubscribeFromToken(form: FormData): Promise<void> {
  const token = tokenSchema.parse(form.get("token"));
  await applyUnsubscribe(token);
  revalidatePath(`/unsubscribe/${token}`);
}

export async function resubscribeFromToken(form: FormData): Promise<void> {
  const token = tokenSchema.parse(form.get("token"));
  await applyResubscribe(token);
  revalidatePath(`/unsubscribe/${token}`);
}
