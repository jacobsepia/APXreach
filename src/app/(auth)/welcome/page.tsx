import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasWorkspace } from "@/lib/workspace";
import { createWorkspace } from "@/lib/actions";
import { CreateWorkspaceButton } from "@/components/create-workspace-button";
import { invitesForEmail } from "@/lib/team";
import { acceptInviteAction } from "@/lib/team-actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Name your workspace" };

/*
 * The one step between an account and a CRM. Everyone lands here once —
 * whether they signed up with a password or came through Sign in with APX —
 * because a workspace is what their records will belong to, and it is theirs
 * alone.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  if (await hasWorkspace(session.user.id)) redirect("/dashboard");

  const firstName = session.user.name?.split(/\s+/)[0] ?? "there";
  /* Somebody may already be waiting for them: an invitation to their address
     comes first, so a colleague does not create a second workspace by mistake. */
  const invites = await invitesForEmail(session.user.email);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="font-display text-lg font-bold tracking-[-0.4px]">
            <span className="text-foreground">APX</span>
            <span className="text-[var(--accent-primary)]">Reach</span>
          </div>
          <h1 className="mt-3 font-display text-[26px] font-bold tracking-[-0.03em] text-foreground">
            {invites.length ? <>Welcome, {firstName}. You&apos;ve been <span className="gradient-text-flow">invited</span>.</> : <>Welcome, {firstName}. What&apos;s the{" "}<span className="gradient-text-flow">company</span>?</>}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {invites.length ? "Join the workspace below, or start one of your own." : "Your contacts, deals and books all live inside it. Nobody else can see it."}
          </p>
        </div>
        {invites.length > 0 && (
          <div className="mb-4 flex flex-col gap-2">
            {invites.map((invite) => (
              <form key={invite.id} action={acceptInviteAction} className="accent-rail relative flex items-center justify-between gap-3 overflow-hidden rounded-2xl border border-border bg-white px-5 py-4 shadow-[var(--edge-top)]">
                <input type="hidden" name="token" value={invite.token} />
                <div className="min-w-0">
                  <div className="truncate font-display text-[15px] font-semibold text-foreground">{invite.workspaceName}</div>
                  <div className="truncate text-xs text-muted-foreground">{invite.invitedBy ? `Invited by ${invite.invitedBy}` : "Invited"} · as {invite.role === "owner" ? "an owner" : "a member"}</div>
                </div>
                <button type="submit" className="flex h-9 shrink-0 items-center rounded-[10px] bg-[image:var(--gradient-cta)] px-4 text-[13px] font-medium text-white">Join</button>
              </form>
            ))}
            {error && <p className="text-xs font-medium text-[#b91c1c]">{error}</p>}
            <p className="text-center text-xs text-[var(--text-tertiary)]">Or start a separate workspace:</p>
          </div>
        )}
        <div className="accent-rail relative overflow-hidden rounded-2xl border border-border bg-white p-6 shadow-[var(--edge-top)]">
          <form action={createWorkspace} className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[#6f7885]">
                Company name
              </span>
              <input
                name="companyName"
                required
                autoFocus
                maxLength={80}
                placeholder="Sepia Consulting"
                className="h-10 w-full rounded-[10px] border border-[rgba(21,24,28,0.14)] bg-white px-3 text-sm text-[#15181c] outline-none focus:border-[#6b21a8]"
              />
            </div>
            {error && !invites.length && <p className="text-xs font-medium text-[#b91c1c]">{error}</p>}
            <CreateWorkspaceButton />
          </form>
        </div>
        <p className="mt-4 text-center text-[13px] text-muted-foreground">
          You can connect APX Ledger — or another set of books — right after.
        </p>
      </div>
    </main>
  );
}
