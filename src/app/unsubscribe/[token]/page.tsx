import { unsubscribeTarget } from "@/lib/campaigns/unsubscribe-store";
import { resubscribeFromToken, unsubscribeFromToken } from "@/lib/campaigns/unsubscribe-actions";

/*
 * The unsubscribe page. Public, outside the signed-in app, and deliberately
 * a button rather than an act-on-load: link scanners and mail previews fetch
 * every URL in a message, and a person who never clicked anything should not
 * find themselves off the list.
 */

export const dynamic = "force-dynamic";

export const metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const target = await unsubscribeTarget(token);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#faf9fb] px-5 py-12">
      <div className="w-full max-w-[440px] rounded-2xl border border-[#e8e4ee] bg-white p-8 shadow-[0_1px_2px_rgba(48,43,54,0.04)]">
        <div className="font-display text-lg font-semibold tracking-[-0.02em] text-[#302b36]">
          {!target ? "This link has expired" : target.unsubscribed ? "You're unsubscribed" : "Unsubscribe"}
        </div>

        {!target ? (
          <p className="mt-2 text-sm leading-relaxed text-[#6b6675]">
            We couldn&rsquo;t match this link to anyone. It may have been edited on its way here, or the record may have
            been removed. Replying to the email you received will always reach a person.
          </p>
        ) : target.unsubscribed ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-[#6b6675]">
              {target.email || "You"} will no longer receive marketing email from {target.workspaceName}. Messages about
              work already underway — an invoice, a reply to something you asked — still come through.
            </p>
            <form action={resubscribeFromToken} className="mt-5">
              <input type="hidden" name="token" value={token} />
              <button
                type="submit"
                className="h-9 rounded-[10px] border border-[#dcd7e4] bg-white px-3.5 text-[13px] font-medium text-[#6b6675] hover:border-[#6b21a8] hover:text-[#302b36]"
              >
                Unsubscribed by mistake? Resubscribe
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm leading-relaxed text-[#6b6675]">
              Stop marketing email from {target.workspaceName} to{" "}
              <strong className="font-medium text-[#302b36]">{target.email || "this address"}</strong>. You will still
              get messages about work already underway, like an invoice or a reply to something you asked.
            </p>
            <form action={unsubscribeFromToken} className="mt-5">
              <input type="hidden" name="token" value={token} />
              <button
                type="submit"
                className="h-9 rounded-[10px] bg-[image:var(--gradient-cta)] px-4 text-[13px] font-medium text-white"
              >
                Unsubscribe me
              </button>
            </form>
          </>
        )}

        <p className="mt-6 border-t border-[#f0edf4] pt-4 text-xs text-[#9b96a6]">Sent through APX Reach.</p>
      </div>
    </main>
  );
}
