import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { acceptInvite } from "@/lib/team";

/*
 * The invitation link. The route guard already sent anyone without a session
 * to sign in with this page as the destination, so by the time this renders
 * there is a person to add. A good token adds them and goes to the dashboard;
 * a bad one says exactly why, with the way out.
 */

export const dynamic = "force-dynamic";

export const metadata = { title: "Join workspace" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(`/sign-in?to=${encodeURIComponent(`/invite/${token}`)}`);

  const outcome = await acceptInvite(token, session.user.id, session.user.email);
  if (outcome.ok) redirect(outcome.alreadyMember ? "/dashboard" : "/dashboard?joined=1");

  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-border bg-white p-6 shadow-[var(--edge-top)]">
      <h1 className="font-display text-xl font-bold tracking-[-0.03em] text-foreground">This invitation can&apos;t be used</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{outcome.error}</p>
      <p className="mt-4 text-[13px] text-muted-foreground">
        You are signed in as <strong className="text-foreground">{session.user.email}</strong>.
      </p>
      <div className="mt-5 flex gap-2">
        <Link href="/dashboard" className="flex h-9 items-center rounded-[10px] bg-[image:var(--gradient-cta)] px-4 text-[13px] font-medium text-white">Go to my workspace</Link>
        <Link href="/sign-in" className="flex h-9 items-center rounded-[10px] border border-input bg-white px-4 text-[13px] font-medium text-foreground">Sign in as someone else</Link>
      </div>
    </div>
  );
}
