"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loadContactRecord } from "@/lib/contact-record";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Mail,
  MessageSquareText,
  Phone,
  StickyNote,
  Users,
  X,
} from "lucide-react";
import { money, relativeDay, shortDate } from "@/lib/format";
import { Avatar, LedgerDot, StagePill } from "@/components/ui";

type ContactRecord = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  lifecycleStage: string;
  ownerName: string | null;
  lastActivityAt: Date | null;
  createdAt: Date;
  companyId: string | null;
  companyName: string | null;
  arBalanceCents: number | null;
  overdueCents: number | null;
};

type Activity = {
  id: string;
  type: string;
  subject: string;
  body: string | null;
  actorName: string | null;
  occurredAt: Date;
  completedAt: Date | null;
};

type Deal = {
  id: string;
  name: string;
  amountCents: number;
  closeDate: string | null;
  status: string;
  stageName: string;
};

const activityIcons = {
  email: Mail,
  call: Phone,
  meeting: Users,
  task: CheckCircle2,
  note: StickyNote,
} as const;

function ActivityIcon({ type }: { type: string }) {
  const Icon = activityIcons[type as keyof typeof activityIcons] ?? MessageSquareText;
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-white">
      <Icon className="size-3.5 text-[var(--accent-primary)]" />
    </span>
  );
}

function Property({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 py-2.5 text-[13px]">
      <span className="text-[var(--text-tertiary)]">{label}</span>
      <span className="min-w-0 break-words [overflow-wrap:anywhere] font-medium text-foreground">{children}</span>
    </div>
  );
}

export function ContactRecordModal({
  contact,
  children,
}: {
  contact: ContactRecord;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"activity" | "about">("activity");
  const [data, setData] = useState<{ activities: Activity[]; deals: Deal[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const activities = data?.activities ?? [];
  const deals = data?.deals ?? [];
  const name = `${contact.firstName} ${contact.lastName}`;

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setError(null);
    setData(null);
    const timeout = window.setTimeout(() => {
      if (active) {
        active = false;
        setError("History is taking too long to load. Please retry.");
      }
    }, 15000);
    loadContactRecord(contact.id).then((result) => {
      if (active) setData(result);
    }).catch(() => {
      if (active) setError("We couldn't load this contact's history. Please retry.");
    }).finally(() => window.clearTimeout(timeout));
    return () => { active = false; window.clearTimeout(timeout); };
  }, [open, contact.id, attempt]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="group flex min-w-0 items-center gap-2.5 text-left"
        aria-haspopup="dialog"
        aria-label={`Open ${name}'s contact record`}
      >
        {children}
      </button>

      {open && createPortal(
        <dialog
          ref={dialogRef}
          aria-label={`${name}'s contact record`}
          onCancel={() => setOpen(false)}
          onClose={() => setOpen(false)}
          className="fixed inset-0 m-0 flex h-dvh max-h-none w-screen max-w-none justify-end border-0 bg-transparent p-3 text-foreground backdrop:bg-[rgba(21,24,28,0.32)] sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            className="flex h-full w-full max-w-[1020px] flex-col overflow-hidden rounded-2xl border border-[rgba(21,24,28,0.1)] bg-[#f8faf8] shadow-[0_24px_72px_rgba(16,24,40,0.26)]"
          >
            <header className="border-b border-border bg-white px-5 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3.5">
                  <Avatar name={name} className="size-11 text-sm" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-[22px] font-bold tracking-[-0.03em] text-foreground">{name}</h2>
                      <StagePill stage={contact.lifecycleStage} />
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-[var(--text-tertiary)]">
                      {[contact.title, contact.companyName].filter(Boolean).join(" · ") || "Contact record"}
                    </p>
                  </div>
                </div>
                <button
                  autoFocus
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close contact record"
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--tint)] hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {contact.email && (
                  <a href={`mailto:${contact.email}`} className="flex h-8 items-center gap-1.5 rounded-[10px] border border-input bg-white px-3 text-[13px] font-medium text-foreground hover:bg-[var(--tint)]">
                    <Mail className="size-3.5" /> Email
                  </a>
                )}
                {contact.phone && (
                  <a href={`tel:${contact.phone}`} className="flex h-8 items-center gap-1.5 rounded-[10px] border border-input bg-white px-3 text-[13px] font-medium text-foreground hover:bg-[var(--tint)]">
                    <Phone className="size-3.5" /> Call
                  </a>
                )}
                <button type="button" onClick={() => setTab("activity")} className="flex h-8 items-center gap-1.5 rounded-[10px] bg-[image:var(--gradient-cta)] px-3 text-[13px] font-medium text-white">
                  <MessageSquareText className="size-3.5" /> Activity
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              {!data && !error && <p role="status" className="mb-4 text-sm text-muted-foreground">Loading activity and deals…</p>}
              {error && <div role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">{error} <button type="button" onClick={() => setAttempt((value) => value + 1)} className="ml-2 font-semibold underline">Retry</button></div>}
              <div className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)_265px]">
                <aside className="flex flex-col gap-3.5">
                  <div className="rounded-xl border border-border bg-white px-4 py-3.5 shadow-[var(--edge-top)]">
                    <div className="text-[11px] font-semibold tracking-[0.06em] text-[var(--text-tertiary)] uppercase">About this contact</div>
                    <div className="mt-1 divide-y divide-[var(--rule-soft)]">
                      <Property label="Email">{contact.email ? <a className="text-[var(--accent-primary)] hover:underline" href={`mailto:${contact.email}`}>{contact.email}</a> : "—"}</Property>
                      <Property label="Phone">{contact.phone ? <a className="text-[var(--accent-primary)] hover:underline" href={`tel:${contact.phone}`}>{contact.phone}</a> : "—"}</Property>
                      <Property label="Job title">{contact.title ?? "—"}</Property>
                      <Property label="Owner">{contact.ownerName ?? "Unassigned"}</Property>
                      <Property label="Created">{shortDate(contact.createdAt)}</Property>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-white px-4 py-3.5 shadow-[var(--edge-top)]">
                    <div className="flex items-center justify-between text-[11px] font-semibold tracking-[0.06em] text-[var(--text-tertiary)] uppercase">
                      <span>Company</span><Building2 className="size-3.5" />
                    </div>
                    {contact.companyId ? (
                      <Link href={`/companies/${contact.companyId}`} className="mt-3 flex items-center gap-2.5 rounded-lg p-1 -m-1 hover:bg-[var(--tint)]">
                        <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--accent-plum-200)] text-xs font-semibold text-[var(--accent-primary)]">{contact.companyName?.slice(0, 1)}</span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">{contact.companyName}</span>
                        <ChevronRight className="size-3.5 text-[var(--text-tertiary)]" />
                      </Link>
                    ) : <p className="mt-2 text-[13px] text-[var(--text-tertiary)]">No company associated.</p>}
                  </div>
                </aside>

                <section aria-label="Contact activity and overview" className="rounded-xl border border-border bg-white shadow-[var(--edge-top)]">
                  <div className="flex items-center gap-5 border-b border-border px-4 pt-3">
                    {(["activity", "about"] as const).map((value) => (
                      <button key={value} type="button" onClick={() => setTab(value)} className={`border-b-2 px-0.5 pb-3 text-[13px] font-medium capitalize ${tab === value ? "border-[var(--accent-primary)] text-foreground" : "border-transparent text-[var(--text-tertiary)] hover:text-foreground"}`}>
                        {value === "activity" ? "Activities" : "Overview"}
                      </button>
                    ))}
                  </div>
                  {tab === "activity" ? (
                    <div className="p-4">
                      <div className="mb-3 flex items-center gap-2 text-[12px] text-[var(--text-tertiary)]"><Clock3 className="size-3.5" /> Recent interactions{activities.length === 100 ? " · Latest 100" : ""}</div>
                      <div className="flex flex-col">
                        {activities.map((activity, index) => (
                          <div key={activity.id} className={`flex gap-3 py-3 ${index < activities.length - 1 ? "border-b border-[var(--rule-soft)]" : ""}`}>
                            <ActivityIcon type={activity.type} />
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] text-foreground"><strong className="font-semibold">{activity.subject}</strong>{activity.body ? ` — ${activity.body}` : ""}</p>
                              <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{activity.actorName ?? "Reach"} · {relativeDay(activity.occurredAt)}</p>
                            </div>
                          </div>
                        ))}
                        {data && activities.length === 0 && <p className="py-8 text-center text-[13px] text-[var(--text-tertiary)]">No activity logged for this contact yet.</p>}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4">
                      <p className="mb-4 text-[12px] text-[var(--text-tertiary)]">Contact status and account context</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-lg bg-[var(--tint)] p-3"><div className="text-[11px] text-[var(--text-tertiary)]">Lifecycle stage</div><div className="mt-1"><StagePill stage={contact.lifecycleStage} /></div></div>
                        <div className="rounded-lg bg-[var(--tint)] p-3"><div className="text-[11px] text-[var(--text-tertiary)]">Last activity</div><div className="mt-1 text-[13px] font-semibold text-foreground">{relativeDay(contact.lastActivityAt)}</div></div>
                        <div className="rounded-lg bg-[var(--tint)] p-3"><div className="text-[11px] text-[var(--text-tertiary)]">Associated company</div><div className="mt-1 text-[13px] font-semibold text-foreground">{contact.companyName ?? "—"}</div></div>
                        <div className="rounded-lg bg-[var(--tint)] p-3"><div className="text-[11px] text-[var(--text-tertiary)]">Open deals</div><div className="mt-1 text-[13px] font-semibold text-foreground">{data ? deals.filter((deal) => deal.status === "open").length : "—"}</div></div>
                      </div>
                    </div>
                  )}
                </section>

                <aside className="flex flex-col gap-3.5">
                  <div className="rounded-xl border border-border bg-white px-4 py-3.5 shadow-[var(--edge-top)]">
                    <div className="flex items-center justify-between"><span className="text-[11px] font-semibold tracking-[0.06em] text-[var(--text-tertiary)] uppercase">Deals</span><span className="text-xs text-[var(--text-tertiary)]">{data ? deals.length : "—"}</span></div>
                    <div className="mt-2 divide-y divide-[var(--rule-soft)]">
                      {deals.map((deal) => <div key={deal.id} className="py-2.5"><div className="text-[13px] font-semibold text-foreground">{deal.name}</div><div className="mt-1 flex items-center justify-between gap-2 text-xs text-[var(--text-tertiary)]"><span className="truncate">{deal.stageName} · {shortDate(deal.closeDate)}</span><span className="shrink-0 font-semibold text-foreground">{money(deal.amountCents)}</span></div></div>)}
                      {data && deals.length === 0 && <p className="py-2 text-[13px] text-[var(--text-tertiary)]">No deals associated.</p>}
                    </div>
                  </div>
                  {contact.lifecycleStage === "customer" && contact.arBalanceCents !== null && (
                    <div className="rounded-xl border border-[color-mix(in_srgb,var(--accent-data)_40%,transparent)] bg-white px-4 py-3.5 shadow-[var(--edge-top)]">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.06em] text-[var(--text-tertiary)] uppercase">The books <LedgerDot /></div>
                      <div className="mt-3 grid grid-cols-2 gap-3"><div><div className="text-[11px] text-[var(--text-tertiary)]">Outstanding</div><div className="mt-0.5 font-display text-lg font-semibold text-foreground">{money(contact.arBalanceCents)}</div></div><div><div className="text-[11px] text-[var(--text-tertiary)]">Overdue</div><div className={`mt-0.5 font-display text-lg font-semibold ${Number(contact.overdueCents) > 0 ? "text-[#b91c1c]" : "text-foreground"}`}>{money(contact.overdueCents ?? 0)}</div></div></div>
                    </div>
                  )}
                </aside>
              </div>
            </div>
            <footer className="flex items-center justify-between border-t border-border bg-white px-5 py-3 text-xs text-[var(--text-tertiary)]"><span>Contact record</span><span className="flex items-center gap-1.5"><CalendarDays className="size-3.5" /> Last activity {relativeDay(contact.lastActivityAt)}</span></footer>
          </section>
        </dialog>, document.body
      )}
    </>
  );
}
