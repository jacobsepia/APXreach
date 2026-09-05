import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasWorkspace } from "@/lib/workspace";
import { createWorkspace } from "@/lib/actions";
import { CreateWorkspaceButton } from "@/components/create-workspace-button";

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

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="font-display text-lg font-bold tracking-[-0.4px]">
            <span className="text-foreground">APX</span>
            <span className="text-[var(--accent-primary)]">Reach</span>
          </div>
          <h1 className="mt-3 font-display text-[26px] font-bold tracking-[-0.03em] text-foreground">
            Welcome, {firstName}. What&apos;s the{" "}
            <span className="gradient-text-flow">company</span>?
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Your contacts, deals and books all live inside it. Nobody else can see it.
          </p>
        </div>
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
            {error && <p className="text-xs font-medium text-[#b91c1c]">{error}</p>}
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
