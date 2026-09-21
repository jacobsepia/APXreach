import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, prospects } from "@/db";
import { requireTenant } from "@/lib/workspace";
import { ProspectImport } from "@/components/prospect-import";
export const dynamic = "force-dynamic";
export const metadata = { title: "Prospects" };
export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { workspaceId } = await requireTenant();
  const query = await searchParams;
  const value = (key: string) =>
    Array.isArray(query[key]) ? query[key][0] : query[key];
  const params = {
    view: value("view"),
    q: value("q"),
    list: value("list"),
    page: value("page"),
  };
  const all = await db
    .select()
    .from(prospects)
    .where(eq(prospects.workspaceId, workspaceId));
  const excluded = (s: string) => ["disqualified", "duplicate"].includes(s);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const views = [
    ["active", "All prospects"],
    ["hot", "Fit 5"],
    ["research", "Needs research"],
    ["micro", "Microbusinesses"],
    ["due", "Follow-up due"],
    ["excluded", "Excluded"],
  ];
  const view = params.view ?? "active";
  const q = (params.q ?? "").toLowerCase();
  const rows = all
    .filter((p) =>
      view === "excluded" ? excluded(p.status) : !excluded(p.status),
    )
    .filter((p) => view !== "hot" || p.data.fit === 5)
    .filter((p) => view !== "research" || p.status === "research")
    .filter((p) => view !== "micro" || p.sourceSheet === "Microbusinesses")
    .filter(
      (p) =>
        view !== "due" ||
        Boolean(p.nextActionDate && p.nextActionDate <= today),
    )
    .filter((p) => !params.list || p.data.lists.includes(params.list))
    .filter(
      (p) =>
        !q ||
        [
          p.data.company,
          p.data.industry,
          p.data.location,
          p.data.serviceLane,
          p.ownerName,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q),
    )
    .sort(
      (a, b) =>
        (b.data.fit ?? 0) - (a.data.fit ?? 0) ||
        a.data.company.localeCompare(b.data.company),
    );
  const page = Math.max(
    1,
    Math.min(
      Math.ceil(rows.length / 50) || 1,
      Math.floor(Number(params.page)) || 1,
    ),
  );
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold gradient-text-flow">
          Prospects
        </h1>
        <p className="text-sm text-muted-foreground">
          Turn research into your next conversation. {all.length} source records
          · {all.filter((p) => p.companyId).length} linked to CRM
        </p>
      </div>
      <ProspectImport />
      <nav aria-label="Prospect views" className="flex flex-wrap gap-2">
        {views.map(([key, label]) => (
          <Link
            key={key}
            href={`/prospects?view=${key}`}
            className={`rounded-full border px-3 py-1.5 text-sm ${view === key ? "bg-[var(--tint-strong)] text-[var(--accent-primary)]" : "bg-white"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <form className="flex flex-wrap gap-2">
        <input type="hidden" name="view" value={view} />
        <input
          aria-label="Search prospects"
          name="q"
          defaultValue={params.q}
          placeholder="Search company, industry, location, service…"
          className="min-w-64 flex-1 rounded-lg border bg-white px-3 py-2 text-sm"
        />
        <select
          aria-label="Source list"
          name="list"
          defaultValue={params.list ?? ""}
          className="rounded-lg border bg-white px-3"
        >
          <option value="">All source lists</option>
          {[...new Set(all.flatMap((p) => p.data.lists))].sort().map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
        <button className="rounded-lg border bg-white px-4">Filter</button>
      </form>
      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--tint)] text-xs text-muted-foreground">
            <tr>
              {[
                "Company",
                "Fit",
                "Service / industry",
                "Location / size",
                "Status",
                "Next action",
              ].map((h) => (
                <th key={h} className="p-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice((page - 1) * 50, page * 50).map((p) => (
              <tr
                key={p.id}
                className="border-t border-border hover:bg-[var(--tint)]"
              >
                <td className="p-3">
                  <Link
                    className="font-medium text-[var(--accent-primary)]"
                    href={`/prospects/${p.id}`}
                  >
                    {p.data.company}
                  </Link>
                  <div className="text-xs text-muted-foreground mt-1">
                    {p.data.contact ?? "Decision-maker needed"} ·{" "}
                    {p.sourceSheet}
                  </div>
                </td>
                <td className="p-3 font-semibold">{p.data.fit ?? "—"}</td>
                <td className="p-3">
                  {p.data.serviceLane ?? p.data.industry ?? "—"}
                </td>
                <td className="p-3">
                  {p.data.location ?? "—"}
                  <div className="text-xs text-muted-foreground">
                    {p.data.employees}
                  </div>
                </td>
                <td className="p-3 capitalize">{p.status}</td>
                <td className="p-3">
                  {p.nextAction ?? "Set next action"}
                  <div className="text-xs text-muted-foreground">
                    {p.nextActionDate}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="p-8 text-center text-muted-foreground">
            {all.length
              ? "No prospects match these filters."
              : "Import your workbook to start reviewing prospects."}
          </p>
        )}
      </div>
      <div className="flex justify-between text-sm">
        <span>
          {rows.length} matching records · Page {page}
        </span>
        <div className="flex gap-4">
          {[page - 1, page + 1]
            .filter((n) => n >= 1 && n <= Math.ceil(rows.length / 50))
            .map((n) => (
              <Link
                key={n}
                href={`/prospects?${new URLSearchParams({ view, q: params.q ?? "", list: params.list ?? "", page: String(n) })}`}
              >
                {n < page ? "Previous" : "Next"}
              </Link>
            ))}
        </div>
      </div>
    </div>
  );
}
