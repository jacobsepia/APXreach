"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { addTagToContact, removeTagFromContact } from "@/lib/tag-actions";
import { tagStyle } from "@/lib/tag-styles";

/*
 * The tags on one person: chips with an x, and a "+" that offers the tags
 * the workspace already uses before it makes a new one — which is how a
 * workspace ends up with six tags everybody understands rather than sixty
 * near-duplicates.
 */

export type TagChip = { id: string; name: string; color: string };

export function ContactTags({ contactId, tags, suggestions, editable = true }: { contactId: string; tags: TagChip[]; suggestions: TagChip[]; editable?: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const add = async (name: string) => {
    if (!name.trim() || busy) return;
    setBusy(true); setError(null);
    const form = new FormData();
    form.set("contactId", contactId); form.set("name", name.trim());
    const outcome = await addTagToContact(form);
    setBusy(false);
    if (outcome.ok) { setDraft(""); setOpen(false); router.refresh(); }
    else setError(outcome.error);
  };

  const unused = suggestions.filter((tag) => !tags.some((carried) => carried.id === tag.id));

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span key={tag.id} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tagStyle(tag.color)}`}>
          {tag.name}
          {editable && (
            <form action={removeTagFromContact} className="flex">
              <input type="hidden" name="contactId" value={contactId} />
              <input type="hidden" name="tagId" value={tag.id} />
              <button type="submit" aria-label={`Remove tag ${tag.name}`} className="opacity-60 hover:opacity-100"><X className="size-3" /></button>
            </form>
          )}
        </span>
      ))}

      {editable && (
        <span className="relative">
          <button type="button" onClick={() => { setOpen((value) => !value); setTimeout(() => input.current?.focus(), 0); }} aria-label="Add a tag" className="flex size-5 items-center justify-center rounded-full border border-dashed border-[rgba(21,24,28,0.25)] text-[var(--text-tertiary)] hover:border-[#6b21a8] hover:text-[var(--accent-primary)]">
            <Plus className="size-3" />
          </button>
          {open && (
            <span onMouseLeave={() => setOpen(false)} className="absolute left-0 top-6 z-30 flex w-[220px] flex-col gap-1 rounded-[10px] border border-[rgba(21,24,28,0.12)] bg-white p-2 shadow-[0_10px_28px_rgba(21,24,28,0.14)]">
              <input
                ref={input}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void add(draft); } if (event.key === "Escape") setOpen(false); }}
                placeholder="New or existing tag"
                maxLength={40}
                className="h-8 w-full rounded-[8px] border border-[rgba(21,24,28,0.14)] px-2 text-[12px] outline-none focus:border-[#6b21a8]"
              />
              {error && <span className="text-[11px] text-[#b91c1c]">{error}</span>}
              {unused.filter((tag) => tag.name.toLowerCase().includes(draft.trim().toLowerCase())).slice(0, 6).map((tag) => (
                <button key={tag.id} type="button" onClick={() => void add(tag.name)} className="flex items-center rounded-[6px] px-1 py-1 text-left hover:bg-[var(--tint)]">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tagStyle(tag.color)}`}>{tag.name}</span>
                </button>
              ))}
              {draft.trim() && !suggestions.some((tag) => tag.name.toLowerCase() === draft.trim().toLowerCase()) && (
                <button type="button" onClick={() => void add(draft)} disabled={busy} className="rounded-[6px] px-1 py-1 text-left text-[12px] text-[var(--accent-primary)] hover:bg-[var(--tint)]">
                  {busy ? "Adding…" : `Create “${draft.trim()}”`}
                </button>
              )}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
