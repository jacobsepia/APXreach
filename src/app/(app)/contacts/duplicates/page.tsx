import Link from "next/link";
import { requireTenant } from "@/lib/workspace";
import { duplicateCompanies, duplicateContacts } from "@/lib/duplicates";
import { mergeCompanies, mergeContacts } from "@/lib/merge-actions";
import { money, relativeDay } from "@/lib/format";
import { Avatar, Card, Pill } from "@/components/ui";
import { ChevronRight, Merge } from "lucide-react";

/*
 * Likely duplicates, in groups, each with a radio for the one to keep. The
 * default keeper is the oldest record — usually the one the books know or
 * the one with the history — and the page says what will happen before the
 * button is pressed.
 */

export const dynamic = "force-dynamic";

export const metadata = { title: "Duplicates" };

export default async function DuplicatesPage() {
  const { workspaceId } = await requireTenant();
  const [people, firms] = await Promise.all([duplicateContacts(workspaceId), duplicateCompanies(workspaceId)]);
  const button = "flex h-8 items-center gap-1.5 rounded-[10px] bg-[image:var(--gradient-cta)] px-3.5 text-[13px] font-medium text-white";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5 text-[13px] text-[var(--text-tertiary)]">
        <Link href="/contacts" className="hover:text-foreground">Contacts</Link>
        <ChevronRight className="size-3.5" />
        <span className="font-medium text-foreground">Duplicates</span>
      </div>
      <div>
        <h1 className="font-display text-2xl font-bold tracking-[-0.035em]"><span className="gradient-text-flow">Duplicates</span></h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {people.length + firms.length === 0
            ? "Nothing looks like a duplicate. People are compared by email address and full name; companies by name and domain."
            : `${people.length} ${people.length === 1 ? "group" : "groups"} of people and ${firms.length} of companies look alike. Pick the record to keep in each; the rest fold into it — emails, notes, deals and tickets included. Merging cannot be undone.`}
        </p>
      </div>

      {people.map((group, index) => (
        <Card key={group.key} index={index} className="p-5">
          <form action={mergeContacts} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Pill kind="warning">{group.reason}</Pill>
              <button type="submit" className={button}><Merge className="size-3.5" /><span>Merge {group.records.length} into the one kept</span></button>
            </div>
            <div className="flex flex-col">
              {group.records.map((record, i) => (
                <label key={record.id} className={`flex cursor-pointer items-center gap-3 py-2.5 ${i < group.records.length - 1 ? "border-b border-[var(--rule-soft)]" : ""}`}>
                  <input type="radio" name="keepId" value={record.id} defaultChecked={i === 0} className="accent-[#6b21a8]" />
                  <input type="hidden" name="mergeId" value={record.id} />
                  <Avatar name={`${record.firstName} ${record.lastName}`} className="size-7" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-foreground">{record.firstName} {record.lastName === "—" ? "" : record.lastName}</span>
                    <span className="block truncate text-xs text-[var(--text-tertiary)]">{[record.email, record.phone, record.title, record.companyName].filter(Boolean).join(" · ") || "No details"}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-[var(--text-tertiary)]">
                    <span className="block">added {relativeDay(record.createdAt)}</span>
                    <span className="block">active {relativeDay(record.lastActivityAt)}</span>
                  </span>
                  {i === 0 && <Pill kind="customer">Keep</Pill>}
                </label>
              ))}
            </div>
          </form>
        </Card>
      ))}

      {firms.map((group, index) => (
        <Card key={group.key} index={people.length + index} className="p-5">
          <form action={mergeCompanies} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Pill kind="warning">Companies · {group.reason.toLowerCase()}</Pill>
              <button type="submit" className={button}><Merge className="size-3.5" /><span>Merge {group.records.length} into the one kept</span></button>
            </div>
            <div className="flex flex-col">
              {group.records.map((record, i) => (
                <label key={record.id} className={`flex cursor-pointer items-center gap-3 py-2.5 ${i < group.records.length - 1 ? "border-b border-[var(--rule-soft)]" : ""}`}>
                  <input type="radio" name="keepId" value={record.id} defaultChecked={i === 0} className="accent-[#6b21a8]" />
                  <input type="hidden" name="mergeId" value={record.id} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-foreground">{record.name}</span>
                    <span className="block truncate text-xs text-[var(--text-tertiary)]">{[record.domain, record.city, record.lifecycleStage, record.externalContactId ? "in the books" : null, record.arBalanceCents ? `${money(record.arBalanceCents)} receivable` : null].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="shrink-0 text-xs text-[var(--text-tertiary)]">added {relativeDay(record.createdAt)}</span>
                  {i === 0 && <Pill kind="customer">Keep</Pill>}
                </label>
              ))}
            </div>
          </form>
        </Card>
      ))}
    </div>
  );
}
