"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { syncQualifiedProspects } from "@/lib/prospect-actions";
import type { SyncSummary } from "@/lib/prospect-sync-plan";

export function ProspectSync() {
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function run(mode: "preview" | "sync") {
    setBusy(true);
    setError("");
    try {
      const result = await syncQualifiedProspects(mode);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSummary(result.summary);
      setDone(mode === "sync");
      if (mode === "sync") router.refresh();
    } catch {
      setError(
        "The request could not finish. Retry safely; synced records are matched on the next run.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-xl border border-border bg-white p-4 space-y-3 text-sm">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="font-semibold">Connect research to your CRM</h2>
          <p className="mt-1 text-muted-foreground">
            Future imports sync automatically. For existing records, preview and
            sync all eligible companies and named contacts in this workspace.
          </p>
        </div>
        <button
          disabled={busy}
          onClick={() => run("preview")}
          className="rounded-lg border px-4 py-2 disabled:opacity-50"
        >
          {busy ? "Checking records…" : "Sync qualified records to CRM"}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Eligible means a business name is recorded, the prospect is not skipped
        or duplicate, and its identity and company match are unambiguous. Fit
        scores remain priorities. This does not create deals or send emails.
      </p>
      {summary && (
        <div className="space-y-3 border-t pt-3" role="status">
          <p>
            {done ? "Sync complete:" : "Preview:"}{" "}
            <strong>{summary.companiesCreated}</strong>{" "}
            {done ? "companies created" : "new companies"} ·{" "}
            <strong>{summary.contactsCreated}</strong>{" "}
            {done ? "contacts added" : "new contacts"} ·{" "}
            <strong>{summary.recordsLinked}</strong> research records{" "}
            {done ? "linked" : "to link"}.
          </p>
          <p>
            {summary.alreadyLinked} already linked · {summary.excluded} skipped
            or duplicate · {summary.held.length} need review.
          </p>
          {!!summary.held.length && (
            <details>
              <summary className="cursor-pointer font-medium">
                Records held for review
              </summary>
              <ul className="max-h-64 overflow-y-auto mt-2 space-y-2">
                {summary.held.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={`/prospects/${row.id}`}
                      className="text-[var(--accent-primary)]"
                    >
                      {row.company}
                    </Link>{" "}
                    — {row.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {!done && (
            <button
              disabled={
                busy || !(summary.recordsLinked || summary.contactsCreated)
              }
              onClick={() => run("sync")}
              className="rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-white disabled:opacity-50"
            >
              {busy ? "Syncing…" : "Sync now"}
            </button>
          )}
          {done && (
            <div className="flex gap-4">
              <Link href="/companies" className="text-[var(--accent-primary)]">
                Open companies →
              </Link>
              <Link href="/contacts" className="text-[var(--accent-primary)]">
                Open contacts →
              </Link>
            </div>
          )}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
