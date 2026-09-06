"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, Paperclip } from "lucide-react";
import { Avatar, Pill } from "@/components/ui";
import { ComposeEmail } from "@/components/compose-email";
import { formatBytes } from "@/lib/email-attachments";
import styles from "./inbox-view.module.css";

/*
 * The Inbox the way a mail client lays it out: the list of messages down the
 * left, the one you clicked open on the right. Selection is local state —
 * there is nothing to remember across visits, and no round trip to open a
 * message that is already on the page. On a phone the two panes take turns.
 */

export type InboxItem = {
  id: string;
  direction: "inbound" | "outbound";
  fromAddress: string;
  toAddress: string;
  subject: string;
  bodyText: string;
  /** Already sanitized on the server; rendered as-is. */
  bodyHtml: string | null;
  attachments: Array<{ name: string; size: number; type: string }>;
  sentAt: string;
  contactId: string | null;
  contactName: string;
  contactFirst: string;
  contactLast: string;
  contactEmail: string | null;
  companyId: string | null;
  companyName: string | null;
};

const dayStamp = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" });
const timeStamp = new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit" });
const fullStamp = new Intl.DateTimeFormat("en-CA", { weekday: "short", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

function listStamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  return sameDay ? timeStamp.format(date) : dayStamp.format(date);
}

function snippet(text: string, max = 90): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function InboxView({ items }: { items: InboxItem[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  /* Phone layout only: which of the two panes is showing. */
  const [paneOpen, setPaneOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;

  /* A fresh poll can add rows above; keep the selection on the same message. */
  useEffect(() => {
    if (selectedId && !items.some((item) => item.id === selectedId)) setSelectedId(items[0]?.id ?? null);
  }, [items, selectedId]);

  const move = (delta: number) => {
    if (!selected) return;
    const index = items.findIndex((item) => item.id === selected.id);
    const next = items[Math.min(items.length - 1, Math.max(0, index + delta))];
    if (next) {
      setSelectedId(next.id);
      listRef.current?.querySelector<HTMLElement>(`[data-id="${next.id}"]`)?.scrollIntoView({ block: "nearest" });
    }
  };

  return (
    <div className={styles.split} data-pane={paneOpen ? "open" : "closed"}>
      <div
        ref={listRef}
        className={styles.list}
        role="listbox"
        aria-label="Messages"
        aria-activedescendant={selected ? `inbox-${selected.id}` : undefined}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
          if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
          if (event.key === "Enter") setPaneOpen(true);
        }}
      >
        {items.map((item) => {
          const inbound = item.direction === "inbound";
          const active = selected?.id === item.id;
          return (
            <button
              key={item.id}
              id={`inbox-${item.id}`}
              data-id={item.id}
              type="button"
              role="option"
              aria-selected={active}
              className={styles.row}
              onClick={() => { setSelectedId(item.id); setPaneOpen(true); }}
            >
              <span className={inbound ? styles.markIn : styles.markOut} title={inbound ? "Received" : "Sent"}>
                {inbound ? <ArrowDownLeft className={styles.markIcon} /> : <ArrowUpRight className={styles.markIcon} />}
              </span>
              <span className={styles.rowText}>
                <span className={styles.rowPerson}>{inbound ? item.contactName : `To ${item.contactName}`}</span>
                <span className={styles.rowSubject}>{item.subject}</span>
                <span className={styles.rowSnippet}>{snippet(item.bodyText)}</span>
              </span>
              <span className={styles.rowSide}>
                <time dateTime={item.sentAt} suppressHydrationWarning>{listStamp(item.sentAt)}</time>
                {item.attachments.length > 0 && <Paperclip className={styles.rowClip} />}
              </span>
            </button>
          );
        })}
        {items.length === 0 && (
          <p className={styles.listEmpty}>
            Nothing yet. Email a contact from their record, and their reply will show up here.
            Mail from addresses Reach doesn&apos;t know stays in your mailbox where it was.
          </p>
        )}
      </div>

      <article className={styles.pane} aria-live="polite">
        {selected ? (
          <>
            <button type="button" className={styles.back} onClick={() => setPaneOpen(false)}>
              <ChevronLeft className={styles.backIcon} /> All messages
            </button>
            <div className={styles.paneHead}>
              <div className={styles.paneTitle}>
                <Avatar name={selected.contactName} className="size-9" />
                <div className={styles.paneTitleText}>
                  <h2>{selected.subject}</h2>
                  <p>
                    {selected.direction === "inbound" ? "From" : "To"} <strong>{selected.contactName}</strong>
                    {selected.companyId && selected.companyName && (
                      <>
                        {" · "}
                        <Link href={`/companies/${selected.companyId}`} className={styles.companyLink}>{selected.companyName}</Link>
                      </>
                    )}
                  </p>
                </div>
              </div>
              <div className={styles.paneActions}>
                <Pill kind={selected.direction === "inbound" ? "ledger" : "customer"}>
                  {selected.direction === "inbound" ? "Received" : "Sent"}
                </Pill>
                {selected.contactId && selected.contactEmail && (
                  <ComposeEmail
                    key={selected.id}
                    recipients={[{
                      id: selected.contactId,
                      firstName: selected.contactFirst,
                      lastName: selected.contactLast,
                      email: selected.contactEmail,
                      companyId: selected.companyId,
                      companyName: selected.companyName,
                    }]}
                    defaultRecipientId={selected.contactId}
                    reply={{
                      subject: /^re:/i.test(selected.subject) ? selected.subject : `Re: ${selected.subject}`,
                      quote: selected.direction === "inbound"
                        ? { from: selected.contactName, sentAt: selected.sentAt, text: selected.bodyText }
                        : undefined,
                    }}
                    buttonLabel={selected.direction === "inbound" ? "Reply" : "Follow up"}
                  />
                )}
              </div>
            </div>

            <dl className={styles.meta}>
              <dt>From</dt><dd>{selected.fromAddress}</dd>
              <dt>To</dt><dd>{selected.toAddress}</dd>
              <dt>Date</dt><dd><time dateTime={selected.sentAt} suppressHydrationWarning>{fullStamp.format(new Date(selected.sentAt))}</time></dd>
            </dl>

            {selected.attachments.length > 0 && (
              <div className={styles.chips} aria-label="Attachments">
                {selected.attachments.map((file, index) => (
                  <span key={file.name + index} className={styles.chip} title={file.name}>
                    <Paperclip className={styles.chipIcon} /><span>{file.name}</span><small>{formatBytes(file.size)}</small>
                  </span>
                ))}
              </div>
            )}

            {selected.bodyHtml ? (
              <div className={`${styles.body} ${styles.rich}`} dangerouslySetInnerHTML={{ __html: selected.bodyHtml }} />
            ) : (
              <div className={`${styles.body} ${styles.plain}`}>{selected.bodyText || "No message content is available."}</div>
            )}
          </>
        ) : (
          <div className={styles.paneEmpty}>Select a message to read it here.</div>
        )}
      </article>
    </div>
  );
}
