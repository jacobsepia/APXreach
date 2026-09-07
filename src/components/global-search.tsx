"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, LoaderCircle, Search, Target, Ticket, UserRound } from "lucide-react";
import { searchWorkspace, type SearchHit } from "@/lib/search";

/*
 * The search box in the top strip. Type two characters and the matches
 * appear underneath, grouped by kind; arrows move, Enter opens, Escape
 * closes, and Ctrl-K or Cmd-K from anywhere puts the cursor here.
 */

const icons = { contact: UserRound, company: Building2, deal: Target, ticket: Ticket } as const;
const labels = { contact: "People", company: "Companies", deal: "Deals", ticket: "Tickets" } as const;

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const latest = useRef(0);
  const router = useRouter();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    const onClick = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setHits([]); setBusy(false); return; }
    const version = ++latest.current;
    setBusy(true);
    const timer = window.setTimeout(async () => {
      try {
        const results = await searchWorkspace(term);
        if (version === latest.current) { setHits(results); setActive(0); setOpen(true); }
      } catch {
        if (version === latest.current) setHits([]);
      } finally {
        if (version === latest.current) setBusy(false);
      }
    }, 160);
    return () => window.clearTimeout(timer);
  }, [query]);

  const go = (hit: SearchHit) => {
    setOpen(false);
    setQuery("");
    setHits([]);
    router.push(hit.href);
  };

  const grouped = (["contact", "company", "deal", "ticket"] as const)
    .map((kind) => ({ kind, items: hits.filter((hit) => hit.kind === kind) }))
    .filter((group) => group.items.length);

  return (
    <div ref={box} className="relative">
      <div className="flex h-8 w-[280px] items-center gap-2 rounded-[10px] border border-input bg-white px-3 text-[13px] text-foreground focus-within:border-[#6b21a8]">
        {busy ? <LoaderCircle className="size-[15px] animate-spin text-[var(--text-tertiary)]" /> : <Search className="size-[15px] text-[var(--text-tertiary)]" />}
        <input
          ref={input}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => { if (hits.length) setOpen(true); }}
          onKeyDown={(event) => {
            if (event.key === "Escape") { setOpen(false); input.current?.blur(); }
            if (!open || !hits.length) return;
            if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => Math.min(hits.length - 1, index + 1)); }
            if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(0, index - 1)); }
            if (event.key === "Enter") { event.preventDefault(); const hit = hits[active]; if (hit) go(hit); }
          }}
          placeholder="Search people, companies, deals…"
          aria-label="Search the workspace"
          aria-expanded={open}
          aria-controls="global-search-results"
          role="combobox"
          aria-autocomplete="list"
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[var(--text-tertiary)]"
        />
        <kbd className="rounded border border-[var(--rule-soft)] px-1 text-[10px] text-[var(--text-tertiary)]">⌘K</kbd>
      </div>

      {open && query.trim().length >= 2 && (
        <div id="global-search-results" role="listbox" className="absolute right-0 top-10 z-40 w-[380px] overflow-hidden rounded-[12px] border border-[rgba(21,24,28,0.1)] bg-white shadow-[0_12px_32px_rgba(21,24,28,0.14)]">
          {grouped.length === 0 && !busy && <p className="px-3 py-3 text-[13px] text-muted-foreground">Nothing matches “{query.trim()}”.</p>}
          {grouped.map((group) => (
            <div key={group.kind}>
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">{labels[group.kind]}</div>
              {group.items.map((hit) => {
                const index = hits.indexOf(hit);
                const Icon = icons[hit.kind];
                return (
                  <button
                    key={hit.kind + hit.id}
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go(hit)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left ${index === active ? "bg-[var(--tint)]" : ""}`}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--tint-strong)] text-[var(--accent-primary)]"><Icon className="size-3.5" /></span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-foreground">{hit.title}</span>
                      <span className="block truncate text-xs text-[var(--text-tertiary)]">{hit.subtitle}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          <div className="border-t border-[var(--rule-soft)] px-3 py-1.5 text-[10px] text-[var(--text-tertiary)]">↑↓ to move · Enter to open · Esc to close</div>
        </div>
      )}
    </div>
  );
}
