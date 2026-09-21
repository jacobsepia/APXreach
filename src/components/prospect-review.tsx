"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createProspectTask,
  linkProspect,
  updateProspect,
} from "@/lib/prospect-actions";
import { prospectStatuses } from "@/lib/prospect-data";
type Review = {
  id: string;
  status: string;
  companyId: string | null;
  ownerName: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
  reviewNotes: string | null;
  data: { fit: number | null; rationale: string | null };
};
export function ProspectReview({ prospect: p }: { prospect: Review }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function submit(form: FormData, link: boolean | "task" = false) {
    setBusy(true);
    setMessage("");
    form.set("id", p.id);
    try {
      if (link) {
        const result =
          link === "task"
            ? await createProspectTask(form)
            : await linkProspect(form);
        setMessage(
          result.ok
            ? link === "task"
              ? "Follow-up added to Tasks."
              : "Linked to CRM. Original research preserved."
            : (result.error ?? "Review required."),
        );
      } else {
        await updateProspect(form);
        setMessage("Review saved.");
      }
      router.refresh();
    } catch {
      setMessage("Could not save. Check your inputs and try again.");
    } finally {
      setBusy(false);
    }
  }
  const field =
    "block w-full rounded-lg border border-border p-2 mt-1 bg-white";
  return (
    <form action={(form) => submit(form)} className="space-y-3 text-sm">
      <fieldset disabled={busy} className="space-y-3">
        <label className="block">
          Research / sales status
          <select name="status" defaultValue={p.status} className={field}>
            {prospectStatuses.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          Owner
          <input
            name="ownerName"
            defaultValue={p.ownerName ?? ""}
            className={field}
          />
        </label>
        <label className="block">
          Reviewed fit
          <select name="fit" defaultValue={p.data.fit ?? ""} className={field}>
            <option value="">Not scored</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="block">
          Why APX fits
          <textarea
            name="rationale"
            rows={4}
            defaultValue={p.data.rationale ?? ""}
            className={field}
          />
        </label>
        <label className="block">
          Next action
          <input
            name="nextAction"
            defaultValue={p.nextAction ?? ""}
            className={field}
          />
        </label>
        <label className="block">
          Follow-up date
          <input
            type="date"
            name="nextActionDate"
            defaultValue={p.nextActionDate ?? ""}
            className={field}
          />
        </label>
        <label className="block">
          Review notes
          <textarea
            name="reviewNotes"
            rows={4}
            defaultValue={p.reviewNotes ?? ""}
            className={field}
          />
        </label>
        <button className="rounded-lg bg-[var(--accent-primary)] text-white px-4 py-2">
          {busy ? "Saving…" : "Save review"}
        </button>
        {!p.companyId && (
          <button
            type="button"
            onClick={() => submit(new FormData(), true)}
            disabled={["disqualified", "duplicate"].includes(p.status)}
            className="block rounded-lg border px-4 py-2 disabled:opacity-50"
          >
            Link or create CRM company
          </button>
        )}
        {p.companyId && (
          <button
            type="button"
            onClick={() => submit(new FormData(), "task")}
            disabled={!p.nextAction}
            className="block rounded-lg border px-4 py-2 disabled:opacity-50"
          >
            Add / update saved action in Tasks
          </button>
        )}
        <p className="text-xs text-muted-foreground">
          Linking uses the saved status. A unique name or domain match links an
          existing company; otherwise it creates one. Multiple matches require
          review. A named primary contact is added if missing.
        </p>
      </fieldset>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
