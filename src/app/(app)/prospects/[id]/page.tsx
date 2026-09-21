import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, prospects } from "@/db";
import { requireTenant } from "@/lib/workspace";
import { ProspectReview } from "@/components/prospect-review";
export const dynamic = "force-dynamic";
export default async function ProspectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { workspaceId } = await requireTenant();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const [p] = await db
    .select()
    .from(prospects)
    .where(and(eq(prospects.id, id), eq(prospects.workspaceId, workspaceId)));
  if (!p) notFound();
  const d = p.data;
  const groups = [
    [
      "Business",
      [
        ["What they do", d.description],
        ["Website", d.domain],
        ["LinkedIn", d.linkedin],
        ["Location", d.location],
        ["Industry", d.industry],
        ["Employees (as researched)", d.employees],
      ],
    ],
    [
      "APX fit",
      [
        ["Current fit", d.fit === null ? null : `${d.fit}/5`],
        ["Original verdict", d.verdict],
        ["Why APX fits", d.rationale],
        ["Signals", d.signals],
        ["Recommended service", d.serviceLane],
        ["Flags", d.flag],
      ],
    ],
    [
      "People and finance research",
      [
        ["Primary contact", d.contact],
        ["Title", d.contactTitle],
        [
          "Finance lead",
          d.financeLead === "None found"
            ? "No finance lead found in research"
            : d.financeLead,
        ],
        ["Finance source", d.financeSource],
        ["Finance notes", d.financeNotes],
      ],
    ],
    [
      "Provenance",
      [
        ["Source lists", d.source],
        ["List memberships", d.lists.join(", ")],
        ["Imported from", `${p.sourceSheet}, row ${p.sourceRow}`],
        ["Original rank", d.originalRank],
      ],
    ],
  ] as const;
  return (
    <div className="space-y-4">
      <Link href="/prospects" className="text-sm text-[var(--accent-primary)]">
        ← Prospects
      </Link>
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">{d.company}</h1>
          <p className="text-sm text-muted-foreground">
            {d.industry} · {d.location}
          </p>
        </div>
        {p.companyId && (
          <Link
            className="rounded-lg border bg-white px-4 py-2 text-sm"
            href={`/companies/${p.companyId}`}
          >
            Open CRM company →
          </Link>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {groups.map(([title, fields]) => (
            <section
              key={title}
              className="rounded-xl border border-border bg-white p-5"
            >
              <h2 className="font-semibold mb-3">{title}</h2>
              <dl className="space-y-3">
                {fields.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 text-sm whitespace-pre-wrap break-words">
                      {value || "Not recorded"}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          <details className="rounded-xl border bg-white p-4 text-sm">
            <summary className="cursor-pointer font-medium">
              Original spreadsheet values
            </summary>
            <dl className="mt-3 space-y-3">
              {Object.entries(p.raw).map(([key, value]) => (
                <div key={key}>
                  <dt className="text-xs text-muted-foreground">{key}</dt>
                  <dd className="whitespace-pre-wrap break-words">
                    {value || "—"}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
        <aside className="rounded-xl border bg-white p-5 h-fit">
          <h2 className="font-semibold mb-3">Review and next action</h2>
          <ProspectReview prospect={p} />
        </aside>
      </div>
    </div>
  );
}
