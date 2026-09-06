"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import EmailEditor from "./email-editor";
import { prepareTemplateDraft } from "@/lib/email-template-actions";
import { templateTags, type EmailTemplate, type TemplateTag } from "@/lib/email-templates";
import styles from "./contact-record-modal.module.css";

export type TemplateDraft = NonNullable<Awaited<ReturnType<typeof prepareTemplateDraft>>["data"]>;
type Props = { contactId: string; firstName: string; templates: EmailTemplate[]; value: string; disabled: boolean; dirty: boolean;
  onChange: (html: string, text: string) => void; onApply: (draft: TemplateDraft) => void };

export default function TemplateEmailEditor(props: Props) {
  const [key, setKey] = useState("");
  const [preview, setPreview] = useState<TemplateDraft | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [invoice, setInvoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const lock = useRef(false);
  const latest = useRef(props);
  latest.current = props;
  useEffect(() => () => { request.current++; }, []);
  const dismiss = () => { request.current++; lock.current = false; setKey(""); setPreview(null); setError(""); setBusy(false); };
  const load = async (selected: string, apply: boolean, initial: boolean) => {
    if (lock.current) return;
    lock.current = true;
    const version = ++request.current;
    setBusy(true); setError("");
    const form = new FormData(); form.set("key", selected); form.set("contactId", props.contactId);
    form.set("fields", JSON.stringify(initial ? {} : fields)); form.set("invoiceNumber", initial ? "" : invoice);
    try {
      const response = await prepareTemplateDraft(form);
      if (response.error) throw new Error(response.error);
      const result = response.data!;
      if (version !== request.current) return;
      if (latest.current.disabled) { dismiss(); return; }
      if (!result.missing.length && (apply || !latest.current.dirty)) { latest.current.onApply(result); dismiss(); }
      else setPreview(result);
    } catch (caught) { if (version === request.current) setError(caught instanceof Error ? caught.message : "Could not load this template. Your draft is unchanged."); }
    finally { if (version === request.current) { lock.current = false; setBusy(false); } }
  };
  const fieldsNeeded = preview?.missing.filter(tag => !tag.startsWith("invoice_")) ?? [];
  return <EmailEditor value={props.value} disabled={props.disabled || busy} firstName={props.firstName} onChange={props.onChange}
    toolbarEnd={<select aria-label="Email templates" value={key} disabled={props.disabled || busy} onChange={event => { const selected = event.target.value; if (!selected) { dismiss(); return; } setKey(selected); setFields({}); setInvoice(""); setPreview(null); void load(selected, false, true); }}>
      <option value="">Templates…</option>{props.templates.map(template => <option key={template.key} value={template.key}>{template.name}</option>)}
    </select>}
    belowToolbar={key ? <div className={styles.templatePanel} aria-label="Personalize template">
      <div className={styles.templatePanelHeading}><strong>{props.templates.find(template => template.key === key)?.name}</strong><Link href="/settings/templates" target="_blank" rel="noopener noreferrer">Manage templates ↗</Link></div>
      {busy && <p role="status">Personalizing your email…</p>}
      {error && <p role="alert">{error}</p>}
      {preview && <>
        {props.dirty && <p>Your subject and message will be replaced. Nothing changes until you choose “Replace draft”.</p>}
        {preview.needsInvoice && <label>Invoice<select aria-label="Template invoice" value={invoice} disabled={busy} onChange={e => setInvoice(e.target.value)}><option value="">Choose an invoice…</option>{preview.invoices.map(inv => <option key={inv.number} value={inv.number}>{inv.number} · due {inv.dueDate}</option>)}</select></label>}
        {preview.needsInvoice && !preview.invoices.length && <p role="status">No eligible invoices in the latest synced books. Choose another template, or sync your books in Settings.</p>}
        {preview.needsInvoice && preview.lastSyncAt && <p>Books last synced {new Date(preview.lastSyncAt).toLocaleString()}. Check these details before sending.</p>}
        {fieldsNeeded.map(tag => <label key={tag}>{templateTags[tag as TemplateTag] ?? tag}<input aria-label={templateTags[tag as TemplateTag] ?? tag} value={fields[tag] ?? ""} maxLength={1000} disabled={busy} onChange={e => setFields({ ...fields, [tag]: e.target.value })} /></label>)}
      </>}
      <div className={styles.templatePanelActions}><button type="button" className={styles.secondaryButton} disabled={props.disabled} onClick={dismiss}>Cancel</button><button type="button" className={styles.primaryButton} disabled={busy || props.disabled || Boolean(preview?.needsInvoice && !invoice) || fieldsNeeded.some(tag => !fields[tag]?.trim())} onClick={() => void load(key, true, false)}>{props.dirty ? "Replace draft" : "Use template"}</button></div>
    </div> : null} />;
}
