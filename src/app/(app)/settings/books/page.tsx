import Link from "next/link";
import { Card, Caps, LedgerDot } from "@/components/ui";
import { cancelBooksChoice, chooseBooksCompany, pendingBooksChoice } from "@/lib/books-choice";
import { ChevronRight } from "lucide-react";

/*
 * "Which company?" — the step between approving the books connection and
 * using it, for a sign-in that covers more than one. A workspace takes
 * exactly one set of books; a second business gets its own workspace and
 * comes back through the same sign-in for its own company.
 */

export const dynamic = "force-dynamic";

export const metadata = { title: "Choose the company" };

export default async function ChooseBooksPage() {
  const choice = await pendingBooksChoice();

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex items-center gap-1.5 text-[13px] text-[var(--text-tertiary)]">
        <Link href="/settings" className="hover:text-foreground">Settings</Link>
        <ChevronRight className="size-3.5" />
        <span className="font-medium text-foreground">Choose the company</span>
      </div>

      {!choice.ok ? (
        <Card className="px-[18px] py-4">
          <Caps>Connection</Caps>
          <p className="mt-2 text-[13px] text-[#b91c1c]">{choice.error}</p>
          <Link href="/settings" className="mt-3 inline-flex h-9 items-center rounded-[10px] border border-input bg-white px-4 text-[13px] font-medium text-foreground">Back to Settings</Link>
        </Card>
      ) : (
        <Card className="px-[18px] py-4">
          <Caps>Which company&apos;s books?</Caps>
          <p className="mt-2 text-sm text-muted-foreground">
            That {choice.providerLabel} sign-in covers {choice.companies.length} companies. This workspace takes one of them — its
            customers, invoices and balances are the ones you will see here. Running more than one business? Add a second
            workspace from the name at the top left and connect it to the next company through the same sign-in.
          </p>
          <form action={chooseBooksCompany} className="mt-3 flex flex-col gap-2">
            {choice.companies.map((company, index) => (
              <label key={company.externalId} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3.5 py-3 hover:border-[#6b21a8]">
                <input type="radio" name="externalCompanyId" value={company.externalId} defaultChecked={index === 0} required className="accent-[#6b21a8]" />
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <LedgerDot />
                  <span className="truncate text-sm font-medium text-foreground">{company.name}</span>
                </span>
                <span className="shrink-0 text-xs text-[var(--text-tertiary)]">{company.currency}</span>
              </label>
            ))}
            <div className="mt-1 flex justify-end gap-2">
              <button type="submit" formAction={cancelBooksChoice} className="h-9 rounded-[10px] border border-input bg-white px-4 text-[13px] font-medium text-foreground">Cancel</button>
              <button type="submit" className="h-9 rounded-[10px] bg-[image:var(--gradient-cta)] px-4 text-[13px] font-medium text-white">Connect these books</button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
