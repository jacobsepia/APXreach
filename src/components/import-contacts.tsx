"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, LoaderCircle } from "lucide-react";
import { Dialog } from "@/components/record-forms";
import { importContacts, type ImportOutcome } from "@/lib/import-actions";
import { guessContactColumns, parseCsv, rowsToContacts, type ContactImportRow } from "@/lib/csv";

/*
 * Import a spreadsheet of people. The file is read in the browser and
 * previewed — how many rows, which columns were understood, the first few
 * people — so the person sees what will happen before anything is written.
 */

type Preview = { fileName: string; rows: ContactImportRow[]; unmapped: string[]; total: number };

export function ImportContacts({ className }: { className: string }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportOutcome | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const close = () => { setOpen(false); setPreview(null); setError(null); setResult(null); setBusy(false); };

  const read = async (file: File | undefined) => {
    setError(null); setResult(null); setPreview(null);
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError("That file is over 5 MB. Split it and import the parts."); return; }
    const text = await file.text();
    const table = parseCsv(text);
    if (table.length < 2) { setError("The file needs a header row and at least one contact."); return; }
    const { mapping, unmapped } = guessContactColumns(table[0]);
    if (mapping.firstName === undefined && mapping.fullName === undefined && mapping.email === undefined) {
      setError(`No name or email column was recognised. Headers found: ${table[0].map((h) => h.trim()).filter(Boolean).join(", ")}.`);
      return;
    }
    const rows = rowsToContacts(table.slice(1), mapping);
    if (!rows.length) { setError("No row had a name or a valid email address."); return; }
    setPreview({ fileName: file.name, rows: rows.slice(0, 2000), unmapped, total: table.length - 1 });
  };

  const run = async () => {
    if (!preview || busy) return;
    setBusy(true); setError(null);
    const form = new FormData();
    form.set("rows", JSON.stringify(preview.rows));
    const outcome = await importContacts(form);
    setBusy(false);
    setResult(outcome);
    if (outcome.ok) { setPreview(null); router.refresh(); }
  };

  const withEmail = preview?.rows.filter((row) => row.email).length ?? 0;
  const companiesNamed = new Set(preview?.rows.map((row) => row.company?.toLowerCase()).filter(Boolean)).size;

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <Download className="size-3.5" />
        <span>Import CSV</span>
      </button>

      {open && (
        <Dialog title="Import contacts from CSV" onClose={close}>
          <div className="flex flex-col gap-3 text-[13px]">
            {!result?.ok && (
              <>
                <p className="text-muted-foreground">
                  A spreadsheet saved as CSV with a header row. Columns Reach understands: first name, last name or full name,
                  email, phone, company, title. Anything else is ignored.
                </p>
                <input ref={fileInput} type="file" accept=".csv,text/csv" onChange={(event) => void read(event.target.files?.[0])}
                  className="block w-full text-[13px] file:mr-3 file:rounded-[8px] file:border file:border-[rgba(21,24,28,0.14)] file:bg-white file:px-3 file:py-1.5 file:text-[12px] file:font-medium" />
              </>
            )}

            {error && <p role="alert" className="rounded-[10px] bg-[#fff4e9] px-3 py-2 text-[#a66a29]">{error}</p>}

            {preview && (
              <div className="flex flex-col gap-2 rounded-[12px] border border-[var(--rule-soft)] bg-[#fdfbff] p-3">
                <p className="font-medium text-foreground">{preview.fileName}</p>
                <ul className="list-disc pl-5 text-muted-foreground">
                  <li>{preview.rows.length} of {preview.total} rows will be imported; {withEmail} have an email address.</li>
                  {companiesNamed > 0 && <li>{companiesNamed} {companiesNamed === 1 ? "company is" : "companies are"} named; existing ones are matched by name, the rest created.</li>}
                  <li>An address already in Reach is skipped, never duplicated.</li>
                  {preview.unmapped.length > 0 && <li>Ignored columns: {preview.unmapped.join(", ")}.</li>}
                  {preview.total > 2000 && <li>Only the first 2,000 rows are imported at a time.</li>}
                </ul>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-left text-[var(--text-tertiary)]"><th className="py-1 pr-3 font-medium">Name</th><th className="py-1 pr-3 font-medium">Email</th><th className="py-1 font-medium">Company</th></tr></thead>
                    <tbody>
                      {preview.rows.slice(0, 5).map((row, index) => (
                        <tr key={index} className="border-t border-[var(--rule-soft)]">
                          <td className="py-1 pr-3">{row.firstName} {row.lastName === "—" ? "" : row.lastName}</td>
                          <td className="py-1 pr-3">{row.email ?? "—"}</td>
                          <td className="py-1">{row.company ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.rows.length > 5 && <p className="mt-1 text-[var(--text-tertiary)]">…and {preview.rows.length - 5} more.</p>}
                </div>
              </div>
            )}

            {result && !result.ok && <p role="alert" className="rounded-[10px] bg-[#fff4e9] px-3 py-2 text-[#a66a29]">{result.error}</p>}
            {result?.ok && (
              <p role="status" className="rounded-[10px] bg-[color-mix(in_srgb,var(--accent-data)_18%,transparent)] px-3 py-2 text-[#3f6212]">
                Imported {result.created} {result.created === 1 ? "contact" : "contacts"}
                {result.companiesCreated ? ` and created ${result.companiesCreated} ${result.companiesCreated === 1 ? "company" : "companies"}` : ""}.
                {result.skipped ? ` ${result.skipped} already here and skipped.` : ""}
              </p>
            )}

            <div className="mt-1 flex justify-end gap-2">
              <button type="button" onClick={close} className="h-9 rounded-[10px] border border-[rgba(21,24,28,0.14)] bg-white px-4 text-[13px] font-medium text-foreground">
                {result?.ok ? "Done" : "Cancel"}
              </button>
              {!result?.ok && (
                <button type="button" disabled={!preview || busy} onClick={() => void run()}
                  className="flex h-9 items-center gap-1.5 rounded-[10px] bg-[image:var(--gradient-cta)] px-4 text-[13px] font-medium text-white disabled:opacity-50">
                  {busy && <LoaderCircle className="size-3.5 animate-spin" />}
                  {busy ? "Importing…" : preview ? `Import ${preview.rows.length} ${preview.rows.length === 1 ? "contact" : "contacts"}` : "Import"}
                </button>
              )}
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
