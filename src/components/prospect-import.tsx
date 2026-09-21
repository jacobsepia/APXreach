"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadProspects } from "@/lib/prospect-actions";
import type { ProspectRow } from "@/lib/prospect-data";

export function ProspectImport() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ProspectRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function run(mode: string) {
    if (!file || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("mode", mode);
      const result = await uploadProspects(form);
      if (!result.ok) setMessage(result.error);
      else if (result.preview) setRows(result.preview);
      else {
        setRows(null);
        setMessage(
          result.count
            ? `${result.count} source rows preserved. Open the prospect queue to review them.`
            : "This exact workbook was already imported. No duplicate rows were created.",
        );
        router.refresh();
      }
    } catch {
      setMessage("The request could not finish. Retry the same file safely.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-xl border border-border bg-white p-4 text-sm space-y-3">
      <div>
        <h2 className="font-semibold">Bring your research into Reach</h2>
        <p className="text-muted-foreground mt-1">
          Import the APX prospect workbook (.xlsx, up to 3 MB). All columns and
          source rows are retained. Companies, deals, and emails are created
          only through later actions.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          aria-label="Prospect workbook"
          type="file"
          accept=".xlsx"
          disabled={busy}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setRows(null);
            setMessage("");
          }}
        />
        <button
          disabled={!file || busy}
          onClick={() => run("preview")}
          className="rounded-lg border px-3 py-2 disabled:opacity-50"
        >
          {busy ? "Reading workbook…" : "Preview workbook"}
        </button>
      </div>
      {rows && (
        <div className="space-y-3 border-t pt-3">
          <p>
            <strong>{rows.length} source rows</strong> ·{" "}
            {rows.filter((r) => r.status === "research").length} to research ·{" "}
            {rows.filter((r) => r.status === "disqualified").length} excluded ·{" "}
            {rows.filter((r) => r.status === "duplicate").length} marked
            duplicate
          </p>
          <p className="text-muted-foreground">
            {[...new Set(rows.map((r) => r.sheet))]
              .map((s) => `${s}: ${rows.filter((r) => r.sheet === s).length}`)
              .join(" · ")}
          </p>
          <p className="text-muted-foreground">
            Rows remain separate until reviewed. No company matches or
            exclusions are applied to your existing CRM records.
          </p>
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr>
                  <th className="p-2">Source</th>
                  <th>Company</th>
                  <th>Fit</th>
                  <th>Disposition</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.sheet}-${r.row}`} className="border-t">
                    <td className="p-2">
                      {r.sheet} · {r.row}
                    </td>
                    <td>{r.data.company}</td>
                    <td>{r.data.fit ?? "—"}</td>
                    <td>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            disabled={busy}
            onClick={() => run("import")}
            className="rounded-lg bg-[var(--accent-primary)] text-white px-4 py-2 disabled:opacity-50"
          >
            Preserve {rows.length} rows in review queue
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
