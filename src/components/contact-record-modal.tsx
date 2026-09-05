"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDownLeft, ArrowUpRight, Building2, CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, Clock3, FileText, Inbox, LoaderCircle, Mail, MessageSquareText, Phone, Search, Send, StickyNote, UserRound, X } from "lucide-react";
import { loadContactRecord } from "@/lib/contact-record";
import { sendEmailFromRecord } from "@/lib/actions";
import { money, relativeDay, shortDate } from "@/lib/format";
import { StagePill } from "@/components/ui";
import styles from "./contact-record-modal.module.css";

type ContactRecord = {
  id: string; firstName: string; lastName: string; email: string | null;
  phone: string | null; title: string | null; lifecycleStage: string;
  ownerName: string | null; lastActivityAt: Date | null; createdAt: Date;
  companyId: string | null; companyName: string | null;
  arBalanceCents: number | null; overdueCents: number | null;
};
type RecordData = Awaited<ReturnType<typeof loadContactRecord>>;
type Message = RecordData["messages"][number];
type View = "activity" | "emails" | "overview" | "compose";

function stamp(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(date));
}

function MessageCard({ message }: { message: Message }) {
  const outbound = message.direction === "outbound";
  return (
    <details className={styles.message} open>
      <summary className={styles.messageSummary}>
        <span className={outbound ? styles.sentIcon : styles.receivedIcon}>{outbound ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}</span>
        <span className={styles.messageTitle}>
          <span className={styles.messageMeta}>{outbound ? "Sent email" : "Received email"} <span>· {stamp(message.sentAt)}</span></span>
          <strong>{message.subject || "(No subject)"}</strong>
        </span>
        <ChevronDown size={17} className={styles.chevron} />
      </summary>
      <div className={styles.messageContent}>
        <dl className={styles.envelope}>
          <dt>From</dt><dd>{message.fromAddress}</dd>
          <dt>To</dt><dd>{message.toAddress}</dd>
        </dl>
        <div className={styles.emailBody}>{message.bodyText || "No plain-text message content is available."}</div>
        <div className={styles.messageFoot}><CheckCircle2 size={13} /> {outbound ? "Sent through your connected mailbox" : "Received in your connected mailbox"}</div>
      </div>
    </details>
  );
}

export function ContactRecordModal({ contact, children }: { contact: ContactRecord; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("activity");
  const [data, setData] = useState<RecordData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sendingRef = useRef(false);
  const name = (contact.firstName + " " + contact.lastName).trim();
  const initials = [contact.firstName, contact.lastName].filter(Boolean).map((part) => part[0]).join("").toUpperCase();
  const dirty = Boolean(subject.trim() || body.trim());

  const requestClose = () => {
    if (sendingRef.current) return;
    if (dirty) { setConfirmClose(true); return; }
    setOpen(false);
  };
  const compose = () => { setView("compose"); setSendError(null); setNotice(null); };
  const refresh = () => setAttempt((value) => value + 1);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; triggerRef.current?.focus(); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setError(null);
    setLoading(true);
    const timeout = window.setTimeout(() => {
      if (active) { active = false; setLoading(false); setError("This record is taking longer to load. Please retry."); }
    }, 15000);
    loadContactRecord(contact.id).then((result) => {
      if (active) { setData(result); setLoading(false); }
    }).catch(() => {
      if (active) { setLoading(false); setError("We couldn't refresh this contact's history. Please retry."); }
    }).finally(() => window.clearTimeout(timeout));
    return () => { active = false; window.clearTimeout(timeout); };
  }, [open, contact.id, attempt]);

  const send = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sendingRef.current || !data?.mailbox || !contact.email) return;
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    const form = new FormData();
    form.set("contactId", contact.id);
    if (contact.companyId) form.set("companyId", contact.companyId);
    form.set("to", contact.email);
    form.set("subject", subject);
    form.set("body", body);
    try {
      await sendEmailFromRecord(form);
      setSubject(""); setBody(""); setQuery("");
      setView("emails");
      setNotice("Email sent from " + data.mailbox.emailAddress + ".");
      refresh();
    } catch (caught) {
      setSendError(caught instanceof Error ? caught.message : "That email couldn't be sent. Your draft has been kept.");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const messages = data?.messages ?? [];
  const activities = data?.activities ?? [];
  const deals = data?.deals ?? [];
  const search = query.trim().toLowerCase();
  const visibleMessages = messages.filter((message) => [message.subject, message.bodyText, message.fromAddress, message.toAddress].join(" ").toLowerCase().includes(search));
  const visibleActivities = activities.filter((activity) => [activity.subject, activity.body, activity.actorName, activity.type].join(" ").toLowerCase().includes(search));
  const openDeals = deals.filter((deal) => deal.status === "open");

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => { setView("activity"); setData(null); setQuery(""); setNotice(null); setOpen(true); }} className={styles.trigger} aria-haspopup="dialog" aria-label={"Open " + name + "'s contact record"}>{children}</button>
      {open && createPortal(
        <dialog ref={dialogRef} aria-label={name + "'s contact record"} onCancel={(event) => { event.preventDefault(); requestClose(); }} className={styles.overlay} onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
          <section className={styles.shell}>
            <header className={styles.header}>
              <div className={styles.identity}>
                <div className={styles.avatar}>{initials}<span /></div>
                <div className={styles.identityText}>
                  <div className={styles.eyebrow}>CONTACT RECORD <span> / </span> APX REACH</div>
                  <div className={styles.nameLine}><h2>{name}</h2><StagePill stage={contact.lifecycleStage} /></div>
                  <p>{[contact.title, contact.companyName].filter(Boolean).join(" at ") || "Your relationship, in one place."}</p>
                </div>
              </div>
              <div className={styles.headerActions}>
                <button type="button" aria-label="Write email" className={styles.primaryButton} onClick={compose} disabled={!contact.email || sending}><Mail size={16} /><span>Write email</span></button>
                <button autoFocus type="button" onClick={requestClose} disabled={sending} aria-label="Close contact record" className={styles.closeButton}><X size={20} /></button>
              </div>
            </header>

            {confirmClose && <div className={styles.discardBar} role="alert">
              <span>You have an unsent draft. Discard it and close?</span>
              <button type="button" className={styles.secondaryButton} onClick={() => { setConfirmClose(false); setView("compose"); }}>Keep writing</button>
              <button type="button" className={styles.textButton} onClick={() => { setSubject(""); setBody(""); setConfirmClose(false); setOpen(false); }}>Discard draft</button>
            </div>}

            <div className={styles.workspace}>
              <aside className={styles.sidebar}>
                <section className={styles.profileSection}>
                  <h3><UserRound size={15} /> Contact details</h3>
                  <div className={styles.property}><span>Email address</span>{contact.email ? <button type="button" onClick={compose} className={styles.emailLink} disabled={sending}>{contact.email}<ArrowUpRight size={13} /></button> : <strong>Not provided</strong>}</div>
                  <div className={styles.property}><span>Phone number</span>{contact.phone ? <a href={"tel:" + contact.phone}>{contact.phone}</a> : <strong>Not provided</strong>}</div>
                  <div className={styles.property}><span>Job title</span><strong>{contact.title || "Not provided"}</strong></div>
                  <div className={styles.owner}><span className={styles.ownerAvatar}><UserRound size={15} /></span><div><span>Contact owner</span><strong>{contact.ownerName || "Unassigned"}</strong></div></div>
                </section>

                <section className={styles.profileSection}>
                  <h3><Building2 size={15} /> Associated company</h3>
                  {contact.companyId ? <Link href={"/companies/" + contact.companyId} className={styles.companyCard}>
                    <span className={styles.companyIcon}><Building2 size={20} /></span><strong>{contact.companyName}</strong><ArrowUpRight size={15} />
                  </Link> : <p className={styles.muted}>No company associated.</p>}
                </section>

                {contact.lifecycleStage === "customer" && contact.arBalanceCents !== null && <section className={styles.booksCard}>
                  <div className={styles.booksLabel}><span /> CONNECTED BOOKS</div>
                  <span className={styles.muted}>Company outstanding</span>
                  <strong className={styles.balance}>{money(contact.arBalanceCents)}</strong>
                  <div className={styles.overdue}><span>Overdue</span><strong className={Number(contact.overdueCents) > 0 ? styles.warning : ""}>{money(contact.overdueCents ?? 0)}</strong></div>
                </section>}
                <div className={styles.recordDates}><CalendarDays size={14} /> Added {new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(new Date(contact.createdAt))}</div>
              </aside>

              <div className={styles.main}>
                <nav className={styles.tabs} aria-label="Contact views">
                  {([{ id: "activity", label: "Activity", icon: Clock3 }, { id: "emails", label: "Emails", icon: Mail }, { id: "overview", label: "Overview", icon: FileText }] as const).map(({ id, label, icon: Icon }) =>
                    <button key={id} type="button" aria-current={view === id ? "page" : undefined} className={view === id ? styles.activeTab : styles.tab} onClick={() => { if (!sending) { setView(id); setQuery(""); } }} disabled={sending}><Icon size={16} />{label}{id === "emails" && data && <span className={styles.count}>{messages.length === 100 ? "100+" : messages.length}</span>}</button>
                  )}
                  {view === "compose" && <span className={styles.composeTab}><Send size={15} />Compose</span>}
                  <span className={styles.mailboxStatus}>{data?.mailbox && <><span />Mailbox connected</>}</span>
                </nav>

                <div className={styles.content}>
                  {notice && <div role="status" className={styles.success}><CheckCircle2 size={17} />{notice}</div>}
                  {error && <div role="alert" className={styles.error}>{error}<button type="button" onClick={refresh}>Retry</button></div>}
                  {loading && <div role="status" className={styles.loading}><LoaderCircle size={16} className={styles.spin} />{data ? "Refreshing history…" : "Loading your contact's history…"}</div>}

                  {view === "compose" ? (
                    <section className={styles.compose}>
                      <button type="button" className={styles.backButton} onClick={() => setView("emails")} disabled={sending}><ChevronLeft size={15} />Back to emails</button>
                      <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>KEEP THE CONVERSATION GOING</span><h3>Write an email</h3><p>Send directly to {contact.firstName} from your connected mailbox.</p></div><span className={styles.headingIcon}><Send size={24} /></span></div>
                      {!data ? (!loading && !error && <p className={styles.muted}>Load the contact to check your mailbox.</p>) : !data.mailbox ? <div className={styles.empty}><Mail size={30} /><h4>Connect your mailbox</h4><p>A connected mailbox is needed to send from Reach.</p><Link href="/settings" className={styles.primaryButton}>Open Settings</Link></div> : !contact.email ? <div className={styles.empty}><h4>No email address yet</h4><p>Add an email address using the contact's edit control.</p></div> : (
                        <form onSubmit={send} className={styles.composeForm}>
                          <div className={styles.composeEnvelope}>
                            <div><span>From</span><strong>{data.mailbox.emailAddress}</strong><span className={styles.provider}>{data.mailbox.providerLabel}</span></div>
                            <div><span>To</span><strong>{name} &lt;{contact.email}&gt;</strong></div>
                          </div>
                          <label className={styles.subjectField}><span>Subject</span><input name="subject" aria-label="Subject" placeholder="Give your email a subject" value={subject} onChange={(event) => setSubject(event.target.value)} required disabled={sending} maxLength={998} autoFocus /></label>
                          <label className={styles.bodyField}><span className={styles.srOnly}>Message</span><textarea name="body" aria-label="Message" placeholder={"Hi " + contact.firstName + ",\n\n"} value={body} onChange={(event) => setBody(event.target.value)} required disabled={sending} rows={11} /></label>
                          {sendError && <div role="alert" className={styles.error}>{sendError}</div>}
                          <div className={styles.composeFooter}><span><CheckCircle2 size={14} />Saved to this contact's history after sending</span><button type="submit" disabled={sending || !subject.trim() || !body.trim()} className={styles.primaryButton}>{sending ? <LoaderCircle size={16} className={styles.spin} /> : <Send size={16} />}{sending ? "Sending…" : "Send email"}</button></div>
                        </form>
                      )}
                    </section>
                  ) : view === "overview" ? (
                    <>
                      <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>THE BIG PICTURE</span><h3>Relationship overview</h3><p>Key details and opportunities, all together.</p></div></div>
                      <div className={styles.metrics}>
                        <div><Clock3 size={18} /><span>Last interaction</span><strong>{relativeDay(contact.lastActivityAt)}</strong></div>
                        <div><Mail size={18} /><span>Recorded emails</span><strong>{data ? (messages.length === 100 ? "100+" : messages.length) : "—"}</strong></div>
                        <div><Building2 size={18} /><span>Open opportunities</span><strong>{data ? openDeals.length : "—"}</strong></div>
                      </div>
                      <div className={styles.sectionHeading}><div><h4>Associated deals</h4><p>Opportunities linked to this contact.</p></div></div>
                      {deals.map((deal) => <article key={deal.id} className={styles.deal}><span className={styles.headingIcon}><FileText size={20} /></span><div><strong>{deal.name}</strong><p>{deal.stageName} · {shortDate(deal.closeDate)}</p></div><strong>{money(deal.amountCents)}</strong></article>)}
                      {data && !deals.length && <div className={styles.empty}><FileText size={30} /><h4>No deals linked yet</h4><p>Associated opportunities will appear here.</p></div>}
                    </>
                  ) : (
                    <>
                      <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>{view === "emails" ? "EVERY MESSAGE, IN CONTEXT" : "YOUR RELATIONSHIP TIMELINE"}</span><h3>{view === "emails" ? "Email history" : "Recent activity"}</h3><p>{view === "emails" ? "Read complete messages, including who sent them and when." : "Conversations, notes, and touchpoints with " + contact.firstName + "."}</p></div><span className={styles.headingIcon}>{view === "emails" ? <Inbox size={24} /> : <MessageSquareText size={24} />}</span></div>
                      <div className={styles.historyTools}><label className={styles.search}><Search size={16} /><input aria-label={view === "emails" ? "Search email history" : "Search activity"} placeholder={view === "emails" ? "Search subjects, messages, or addresses" : "Search this timeline"} value={query} onChange={(event) => setQuery(event.target.value)} /></label><span>{view === "emails" ? visibleMessages.length : visibleActivities.length} {view === "emails" ? (visibleMessages.length === 1 ? "message" : "messages") : (visibleActivities.length === 1 ? "activity" : "activities")}{(view === "emails" ? messages.length : activities.length) === 100 ? " · Latest 100" : ""}</span></div>
                      {view === "emails" ? (
                        <div className={styles.messageList}>{visibleMessages.map((message) => <MessageCard key={message.id} message={message} />)}
                          {data && !visibleMessages.length && <div className={styles.empty}><Inbox size={32} /><h4>{search ? "No matching messages" : "Start a conversation"}</h4><p>{search ? "Try another subject, address, or phrase." : "Emails recorded through Reach will appear here in full."}</p>{!search && contact.email && <button type="button" onClick={compose} className={styles.primaryButton}><Mail size={15} />Write an email</button>}</div>}
                        </div>
                      ) : (
                        <div className={styles.timeline}>
                          {visibleActivities.map((activity) => <article key={activity.id} className={styles.activity}>
                            <span className={styles.timelineIcon}>{activity.type === "email" ? <Mail size={17} /> : activity.type === "call" ? <Phone size={17} /> : <StickyNote size={17} />}</span>
                            <div className={styles.activityCard}><div className={styles.activityMeta}><span>{activity.type.replaceAll("_", " ")}</span><time dateTime={new Date(activity.occurredAt).toISOString()}>{stamp(activity.occurredAt)}</time></div><h4>{activity.subject}</h4>
                              <p className={styles.activityPreview}>{activity.body?.replace(/\s+/g, " ") || "No additional details."}</p>
                              {activity.body && <details className={styles.activityDetails}><summary>Read full {activity.type === "email" ? "message" : "details"}<ChevronDown size={14} /></summary><div className={styles.emailBody}>{activity.body}</div></details>}
                              <div className={styles.activityFooter}><span><UserRound size={13} />{activity.actorName || "Reach"}</span>{activity.type === "email" && <button type="button" onClick={() => { setView("emails"); setQuery(""); }}>View email history<ArrowUpRight size={13} /></button>}</div>
                            </div>
                          </article>)}
                          {data && !visibleActivities.length && <div className={styles.empty}><Clock3 size={32} /><h4>{search ? "No matching activity" : "A fresh start"}</h4><p>{search ? "Try a different search." : "Your interactions with this contact will appear here."}</p></div>}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
            <footer className={styles.footer}><span><span className={styles.footerDot} />{contact.companyName || "Contact"} · {name}</span><span>{sending ? "Sending email…" : dirty ? "Unsent draft · kept while this record is open" : "Everything about this relationship, in one place."}</span></footer>
          </section>
        </dialog>, document.body
      )}
    </>
  );
}
