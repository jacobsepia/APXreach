"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, Paperclip } from "lucide-react";
import { Avatar, Pill } from "@/components/ui";
import { ComposeEmail } from "@/components/compose-email";
import { MakeTicket } from "@/components/ticket-controls";
import { formatBytes } from "@/lib/email-attachments";
import styles from "./inbox-view.module.css";

/*
 * The Inbox the way a mail client lays it out: conversations down the left,
 * the one you clicked open on the right, its messages oldest to newest the
 * way the exchange happened. Selection is local state — there is nothing to
 * remember across visits, and no round trip to open a conversation that is
 * already on the page. On a phone the two panes take turns.
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
  /** The ticket already opened from this email, if any. */
  ticketId: string | null;
  threadKey: string;
};

/** A conversation: its messages, oldest first. */
export type InboxThread = { key: string; messages: InboxItem[] };

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

export function InboxView({ threads }: { threads: InboxThread[] }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(threads[0]?.key ?? null);
  /* Phone layout only: which of the two panes is showing. */
  const [paneOpen, setPaneOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = threads.find((thread) => thread.key === selectedKey) ?? threads[0] ?? null;

  /* A fresh poll can add conversations above; keep the selection where it was. */
  useEffect(() => {
    if (selectedKey && !threads.some((thread) => thread.key === selectedKey)) setSelectedKey(threads[0]?.key ?? null);
  }, [threads, selectedKey]);

  const move = (delta: number) => {
    if (!selected) return;
    const index = threads.findIndex((thread) => thread.key === selected.key);
    const next = threads[Math.min(threads.length - 1, Math.max(0, index + delta))];
    if (next) {
      setSelectedKey(next.key);
      listRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(next.key)}"]`)?.scrollIntoView({ block: "nearest" });
    }
  };

  const latest = selected?.messages[selected.messages.length - 1] ?? null;

  return (
    <div className={styles.split} data-pane={paneOpen ? "open" : "closed"}>
      <div
        ref={listRef}
        className={styles.list}
        role="listbox"
        aria-label="Conversations"
        aria-activedescendant={selected ? `inbox-${selected.key}` : undefined}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
          if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
          if (event.key === "Enter") setPaneOpen(true);
        }}
      >
        {threads.map((thread) => {
          const last = thread.messages[thread.messages.length - 1];
          const inbound = last.direction === "inbound";
          const active = selected?.key === thread.key;
          const hasFiles = thread.messages.some((message) => message.attachments.length > 0);
          return (
            <button
              key={thread.key}
              id={`inbox-${thread.key}`}
              data-key={thread.key}
              type="button"
              role="option"
              aria-selected={active}
              className={styles.row}
              onClick={() => { setSelectedKey(thread.key); setPaneOpen(true); }}
            >
              <span className={inbound ? styles.markIn : styles.markOut} title={inbound ? "They wrote last" : "You wrote last"}>
                {inbound ? <ArrowDownLeft className={styles.markIcon} /> : <ArrowUpRight className={styles.markIcon} />}
              </span>
              <span className={styles.rowText}>
                <span className={styles.rowPerson}>
                  {last.contactName}
                  {thread.messages.length > 1 && <span className={styles.count}>{thread.messages.length}</span>}
                </span>
                <span className={styles.rowSubject}>{last.subject}</span>
                <span className={styles.rowSnippet}>{snippet(last.bodyText)}</span>
              </span>
              <span className={styles.rowSide}>
                <time dateTime={last.sentAt} suppressHydrationWarning>{listStamp(last.sentAt)}</time>
                {hasFiles && <Paperclip className={styles.rowClip} />}
              </span>
            </button>
          );
        })}
        {threads.length === 0 && (
          <p className={styles.listEmpty}>
            Nothing yet. Email a contact from their record, and their reply will show up here.
            Mail from addresses Reach doesn&apos;t know stays in your mailbox where it was.
          </p>
        )}
      </div>

      <article className={styles.pane} aria-live="polite">
        {selected && latest ? (
          <>
            <button type="button" className={styles.back} onClick={() => setPaneOpen(false)}>
              <ChevronLeft className={styles.backIcon} /> All conversations
            </button>
            <div className={styles.paneHead}>
              <div className={styles.paneTitle}>
                <Avatar name={latest.contactName} className="size-9" />
                <div className={styles.paneTitleText}>
                  <h2>{latest.subject}</h2>
                  <p>
                    with <strong>{latest.contactName}</strong>
                    {selected.messages.length > 1 && ` · ${selected.messages.length} messages`}
                    {latest.companyId && latest.companyName && (
                      <>
                        {" · "}
                        <Link href={`/companies/${latest.companyId}`} className={styles.companyLink}>{latest.companyName}</Link>
                      </>
                    )}
                  </p>
                </div>
              </div>
              <div className={styles.paneActions}>
                {latest.direction === "inbound" && (
                  <MakeTicket
                    key={latest.id}
                    messageId={latest.id}
                    ticketId={latest.ticketId}
                    className="flex h-8 items-center gap-1.5 rounded-[10px] border border-input bg-white px-3 text-[13px] font-medium text-foreground hover:border-[#6b21a8] disabled:opacity-60"
                  />
                )}
                {latest.contactId && latest.contactEmail && (
                  <ComposeEmail
                    key={selected.key}
                    recipients={[{
                      id: latest.contactId,
                      firstName: latest.contactFirst,
                      lastName: latest.contactLast,
                      email: latest.contactEmail,
                      companyId: latest.companyId,
                      companyName: latest.companyName,
                    }]}
                    defaultRecipientId={latest.contactId}
                    reply={{
                      subject: /^re:/i.test(latest.subject) ? latest.subject : `Re: ${latest.subject}`,
                      quote: latest.direction === "inbound"
                        ? { from: latest.contactName, sentAt: latest.sentAt, text: latest.bodyText }
                        : undefined,
                    }}
                    buttonLabel={latest.direction === "inbound" ? "Reply" : "Follow up"}
                  />
                )}
              </div>
            </div>

            <div className={styles.thread}>
              {selected.messages.map((message, index) => {
                const inbound = message.direction === "inbound";
                return (
                  <div key={message.id} className={index === selected.messages.length - 1 ? styles.messageLast : styles.message}>
                    <div className={styles.messageHead}>
                      <span className={inbound ? styles.markIn : styles.markOut}>
                        {inbound ? <ArrowDownLeft className={styles.markIcon} /> : <ArrowUpRight className={styles.markIcon} />}
                      </span>
                      <span className={styles.messageWho}>
                        <strong>{inbound ? message.contactName : "You"}</strong>
                        <span>{inbound ? `${message.fromAddress} → ${message.toAddress}` : `${message.fromAddress} → ${message.toAddress}`}</span>
                      </span>
                      <span className={styles.messageWhen}>
                        <Pill kind={inbound ? "ledger" : "customer"}>{inbound ? "Received" : "Sent"}</Pill>
                        <time dateTime={message.sentAt} suppressHydrationWarning>{fullStamp.format(new Date(message.sentAt))}</time>
                      </span>
                    </div>

                    {message.attachments.length > 0 && (
                      <div className={styles.chips} aria-label="Attachments">
                        {message.attachments.map((file, fileIndex) => (
                          <span key={file.name + fileIndex} className={styles.chip} title={file.name}>
                            <Paperclip className={styles.chipIcon} /><span>{file.name}</span><small>{formatBytes(file.size)}</small>
                          </span>
                        ))}
                      </div>
                    )}

                    {message.bodyHtml ? (
                      <div className={`${styles.body} ${styles.rich}`} dangerouslySetInnerHTML={{ __html: message.bodyHtml }} />
                    ) : (
                      <div className={`${styles.body} ${styles.plain}`}>{message.bodyText || "No message content is available."}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className={styles.paneEmpty}>Select a conversation to read it here.</div>
        )}
      </article>
    </div>
  );
}
