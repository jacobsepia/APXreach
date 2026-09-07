import { NextResponse } from "next/server";
import { applyUnsubscribe } from "@/lib/campaigns/unsubscribe-store";

/*
 * One-click unsubscribe (RFC 8058). Gmail and Outlook show their own
 * "Unsubscribe" button beside the sender and POST here when it is pressed —
 * no page is ever rendered, nobody is signed in, and the answer has to be a
 * plain 200 or the client reports the unsubscribe as failed.
 *
 * The token is signed, so this endpoint can only ever act on the one contact
 * the link was minted for. A GET lands a person on the page instead.
 */

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const done = await applyUnsubscribe(token);
  if (!done) return new NextResponse("Unknown unsubscribe link.", { status: 404 });
  return new NextResponse("Unsubscribed.", { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  return NextResponse.redirect(new URL(`/unsubscribe/${encodeURIComponent(token)}`, request.url));
}
