"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { prepareTemplateDraft, saveEmailTemplate } from "@/lib/email-template-actions";
import { starterTemplates, templateTags, type EmailTemplate } from "@/lib/email-templates";
import type { TemplateDraft } from "./template-email-editor";
import styles from "./template-settings.module.css";

const EmailEditor = dynamic(() => import("./email-editor"), { ssr: false });
export function TemplateSettings({ templates, contacts }: { templates: EmailTemplate[]; contacts: { id: string; firstName: string; lastName: string }[] }) {
  const [saved, setSaved] = useState(templates);
  const [draft, setDraft] = useState(templates[0]);
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const subjectRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [preview, setPreview] = useState<TemplateDraft | null>(null);
  const original = saved.find(item => item.key === draft.key)!;
  const dirty = draft.name !== original.name || draft.subject !== original.subject || draft.bodyHtml !== original.bodyHtml;
  useEffect(() => { if (!dirty) return; const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  const choose = (key: string) => { setDraft(saved.find(item => item.key === key)!); setSwitchTo(null); setPreview(null); setInvoiceNumber(""); setError(""); setMessage(""); };
  const edit = (changes: Partial<EmailTemplate>) => { setDraft(current => ({ ...current, ...changes })); setPreview(null); setMessage(""); };
  const form = () => { const result = new FormData(); result.set("key", draft.key); result.set("name", draft.name); result.set("subject", draft.subject); result.set("bodyHtml", draft.bodyHtml); result.set("revision", draft.revision ?? ""); return result; };
  const save = async () => {
    if (lock.current) return; lock.current = true; setBusy(true); setError(""); setMessage("");
    try { const response = await saveEmailTemplate(form()); if (response.error) throw new Error(response.error); const updated = { ...draft, ...response.data! }; setSaved(current => current.map(item => item.key === draft.key ? updated : item)); setDraft(updated); setMessage("Template saved for your workspace. Existing email drafts are unchanged."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save. Your edits are still here."); }
    finally { lock.current = false; setBusy(false); }
  };
  const showPreview = async () => {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try { const input = form(); input.set("contactId", contactId); input.set("invoiceNumber", invoiceNumber); input.set("previewSubject", draft.subject); input.set("previewHtml", draft.bodyHtml); const response = await prepareTemplateDraft(input); if (response.error) throw new Error(response.error); setPreview(response.data!); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not preview this template."); }
    finally { lock.current = false; setBusy(false); }
  };
  return <div className={styles.layout}>
    <nav className={styles.list} aria-label="Templates">{saved.map((item, index) => <button type="button" key={item.key} aria-current={item.key === draft.key ? "page" : undefined} disabled={busy} onClick={() => { if (item.key !== draft.key) { if (dirty) setSwitchTo(item.key); else choose(item.key); } }}><span>{String(index + 1).padStart(2, "0")}</span>{item.name}</button>)}</nav>
    <section className={styles.card} aria-label="Edit email template">
      <div className={styles.heading}><div><small>WORKSPACE TEMPLATE</small><h2>{original.name}</h2></div><span>{dirty ? "Unsaved changes" : "Saved"}</span></div>
      {switchTo && <div className={styles.notice} role="alert">You have unsaved changes.<div><button type="button" onClick={() => setSwitchTo(null)}>Keep editing</button><button type="button" onClick={() => choose(switchTo)}>Discard and switch</button></div></div>}
      {error && <p className={styles.notice} role="alert">{error}</p>}{message && <p className={styles.notice} role="status">{message}</p>}
      <label className={styles.field}>Template name<input aria-label="Template name" value={draft.name} maxLength={80} disabled={busy} onChange={e => edit({ name: e.target.value })} /></label>
      <label className={styles.field}>Subject<div className={styles.subject}><input ref={subjectRef} aria-label="Template subject" value={draft.subject} maxLength={998} disabled={busy} onChange={e => edit({ subject: e.target.value })} /><select aria-label="Insert subject tag" value="" disabled={busy} onChange={e => { const tag = e.target.value; if (!tag) return; const start = subjectRef.current?.selectionStart ?? draft.subject.length; const end = subjectRef.current?.selectionEnd ?? start; edit({ subject: draft.subject.slice(0, start) + `{{${tag}}}` + draft.subject.slice(end) }); }}><option value="">Insert tag…</option>{Object.entries(templateTags).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div></label>
      <div className={styles.editor}><EmailEditor key={draft.key} value={draft.bodyHtml} firstName="{{first_name}}" disabled={busy} allowTags onChange={html => edit({ bodyHtml: html })} /></div>
      <p className={styles.hint}>Tags use the selected contact and connected books. Missing details such as a milestone are requested when composing. Keep each tag together when formatting.</p>
      <div className={styles.actions}><button type="button" disabled={busy} onClick={() => edit({ ...starterTemplates.find(item => item.key === draft.key)!, revision: draft.revision })}>Use starter text</button><button type="button" className={styles.save} disabled={busy || !dirty || !draft.name.trim() || !draft.subject.trim()} onClick={() => void save()}>{busy ? "Working…" : "Save template"}</button></div>
      <details className={styles.preview}><summary>Preview for a customer</summary><p>This previews your current edits without saving or sending an email. Contact list shows the first 100 contacts.</p><div className={styles.previewControls}><select aria-label="Preview contact" value={contactId} disabled={busy} onChange={e => { setContactId(e.target.value); setInvoiceNumber(""); setPreview(null); }}>{contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.firstName} {contact.lastName}</option>)}</select>{preview?.needsInvoice && <select aria-label="Preview invoice" value={invoiceNumber} disabled={busy} onChange={e => setInvoiceNumber(e.target.value)}><option value="">Choose invoice…</option>{preview.invoices.map(inv => <option key={inv.number} value={inv.number}>{inv.number} · due {inv.dueDate}</option>)}</select>}<button type="button" disabled={busy || !contactId} onClick={() => void showPreview()}>Refresh preview</button></div>
        {preview && <><p><strong>Subject:</strong> {preview.subject}</p>{preview.missing.length > 0 && <p className={styles.notice}>Still needed: {preview.missing.map(tag => templateTags[tag as keyof typeof templateTags] ?? tag).join(", ")}. These will be requested before inserting the template.</p>}<div className={styles.previewBody} dangerouslySetInnerHTML={{ __html: preview.bodyHtml }} /></>}
      </details>
    </section>
  </div>;
}
