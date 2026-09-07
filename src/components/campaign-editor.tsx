"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Loader2, Send, Users } from "lucide-react";
import EmailEditor from "./email-editor";
import { previewCampaignAudience, saveCampaign, sendCampaign } from "@/lib/campaigns/actions";

/*
 * Writing a campaign, and the honest preview beside it.
 *
 * The audience is recomputed on the server every time the list or the dunning
 * rule changes, by the same code that decides at send time — so the count on
 * the button is the count that goes out, and the held-back list names people
 * rather than saying "some were skipped". Send saves first: what you looked
 * at is what leaves.
 */

type Campaign = {
  id: string; name: string; subject: string; bodyHtml: string; tagId: string | null;
  fromName: string; fromEmail: string; replyTo: string | null; holdDunning: boolean; status: string;
};
type Preview = { send: number; held: Array<{ name: string; reason: string }> };
type Props = {
  campaign: Campaign;
  lists: Array<{ id: string; name: string; count: number }>;
  initialPreview: Preview;
  canSend: boolean;
  sendingHint: string | null;
};

const field = "h-9 w-full rounded-[10px] border border-input bg-white px-3 text-[13px] text-foreground placeholder:text-[var(--text-tertiary)] focus:border-[#6b21a8] focus:outline-none";
const label = "text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]";

export default function CampaignEditor({ campaign, lists, initialPreview, canSend, sendingHint }: Props) {
  const readOnly = campaign.status !== "draft";
  const [name, setName] = useState(campaign.name);
  const [subject, setSubject] = useState(campaign.subject);
  const [tagId, setTagId] = useState(campaign.tagId ?? "");
  const [fromName, setFromName] = useState(campaign.fromName);
  const [replyTo, setReplyTo] = useState(campaign.replyTo ?? "");
  const [holdDunning, setHoldDunning] = useState(campaign.holdDunning);
  const [body, setBody] = useState(campaign.bodyHtml);
  const [bodyText, setBodyText] = useState("");
  const [preview, setPreview] = useState(initialPreview);
  const [previewing, setPreviewing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const request = useRef(0);
  const firstRender = useRef(true);

  /* Recompute who this reaches whenever the list or the dunning rule moves. */
  useEffect(() => {
    if (readOnly) return;
    if (firstRender.current) { firstRender.current = false; return; }
    const version = ++request.current;
    setPreviewing(true);
    const form = new FormData();
    form.set("tagId", tagId);
    if (holdDunning) form.set("holdDunning", "on");
    previewCampaignAudience(form)
      .then((result) => { if (version === request.current) setPreview(result); })
      .catch(() => { if (version === request.current) setPreview({ send: 0, held: [] }); })
      .finally(() => { if (version === request.current) setPreviewing(false); });
  }, [tagId, holdDunning, readOnly]);

  const formData = () => {
    const form = new FormData();
    form.set("campaignId", campaign.id);
    form.set("name", name);
    form.set("subject", subject);
    form.set("bodyHtml", body);
    form.set("tagId", tagId);
    form.set("fromName", fromName);
    form.set("replyTo", replyTo);
    if (holdDunning) form.set("holdDunning", "on");
    return form;
  };

  const save = () => {
    setError(""); setSaved(false);
    startTransition(async () => {
      const result = await saveCampaign(formData());
      if (result.error) setError(result.error);
      else { setSaved(true); setTimeout(() => setSaved(false), 2400); }
    });
  };

  const send = () => {
    setError("");
    startTransition(async () => {
      const result = await saveCampaign(formData());
      if (result.error) { setError(result.error); setConfirming(false); return; }
      const form = new FormData();
      form.set("campaignId", campaign.id);
      await sendCampaign(form); /* redirects on its way out */
    });
  };

  const emptyBody = !bodyText.trim() && !campaign.bodyHtml.replace(/<[^>]*>/g, "").trim();
  const blocked = !canSend || !tagId || !preview.send || emptyBody || pending;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-4 max-xl:grid-cols-1">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className={label}>Campaign name</span>
            <input className={field} value={name} maxLength={120} disabled={readOnly} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={label}>Goes to</span>
            <select className={field} value={tagId} disabled={readOnly} onChange={(e) => setTagId(e.target.value)}>
              <option value="">Choose a list…</option>
              {lists.map((list) => (
                <option key={list.id} value={list.id}>{list.name} ({list.count})</option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className={label}>Subject</span>
          <input className={field} value={subject} maxLength={998} disabled={readOnly} onChange={(e) => setSubject(e.target.value)} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className={label}>From name</span>
            <input className={field} value={fromName} maxLength={120} disabled={readOnly} onChange={(e) => setFromName(e.target.value)} />
            <span className="text-xs text-[var(--text-tertiary)]">Sent from {campaign.fromEmail || "the address in RESEND_FROM"}.</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className={label}>Replies go to</span>
            <input className={field} value={replyTo} maxLength={254} placeholder="you@yourcompany.ca" disabled={readOnly} onChange={(e) => setReplyTo(e.target.value)} />
            <span className="text-xs text-[var(--text-tertiary)]">Your own mailbox, so answers land where you read them.</span>
          </label>
        </div>

        <div className="rounded-2xl border border-border bg-white p-1">
          <EmailEditor
            value={body}
            disabled={readOnly || pending}
            firstName=""
            placeholder="Write the email…"
            onChange={(html, text) => { setBody(html); setBodyText(text); }}
          />
        </div>
        <p className="text-xs text-[var(--text-tertiary)]">
          Every copy carries who it came from and a one-click unsubscribe link — required by CASL, and added for you.
        </p>

        {error && (
          <p role="alert" className="rounded-[10px] border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[13px] text-[#b91c1c]">{error}</p>
        )}

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="flex h-9 items-center gap-1.5 rounded-[10px] border border-input bg-white px-3.5 text-[13px] font-medium text-foreground hover:border-[#6b21a8] disabled:opacity-50"
            >
              {pending && !confirming ? <Loader2 className="size-3.5 animate-spin" /> : saved ? <Check className="size-3.5 text-[#4d7c0f]" /> : null}
              {saved ? "Saved" : "Save draft"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={blocked}
              title={
                !canSend ? sendingHint ?? "" : !tagId ? "Choose the list this goes to." : emptyBody ? "Write the email first." : !preview.send ? "Nobody on that list can be sent to right now." : ""
              }
              className="flex h-9 items-center gap-1.5 rounded-[10px] bg-[image:var(--gradient-cta)] px-4 text-[13px] font-medium text-white disabled:opacity-50"
            >
              <Send className="size-3.5" />
              Send to {preview.send} {preview.send === 1 ? "person" : "people"}
            </button>
          </div>
        )}

        {confirming && (
          <div className="rounded-2xl border border-[#dcd7e4] bg-[var(--tint-soft)] p-4">
            <div className="text-[13px] font-medium text-foreground">
              Send &ldquo;{subject}&rdquo; to {preview.send} {preview.send === 1 ? "person" : "people"} now?
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">
              This leaves immediately and can&rsquo;t be recalled.
              {preview.held.length ? ` ${preview.held.length} ${preview.held.length === 1 ? "person is" : "people are"} being held back — the reasons are listed beside this.` : ""}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button type="button" onClick={() => setConfirming(false)} disabled={pending} className="h-8 rounded-[10px] border border-input bg-white px-3 text-[13px] font-medium text-muted-foreground">
                Cancel
              </button>
              <button type="button" onClick={send} disabled={pending} className="flex h-8 items-center gap-1.5 rounded-[10px] bg-[image:var(--gradient-cta)] px-3.5 text-[13px] font-medium text-white disabled:opacity-50">
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                {pending ? "Sending…" : "Send now"}
              </button>
            </div>
          </div>
        )}
      </div>

      <aside className="flex flex-col gap-3">
        <div className="rounded-2xl border border-border bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-display text-[14px] font-semibold text-foreground">
              <Users className="size-4 text-[var(--accent-primary)]" />
              Audience
            </div>
            {previewing && <Loader2 className="size-3.5 animate-spin text-[var(--text-tertiary)]" />}
          </div>
          {!tagId ? (
            <p className="mt-2 text-[13px] text-muted-foreground">
              Choose a list and this fills in with who it reaches — and who it doesn&rsquo;t.
            </p>
          ) : (
            <>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="font-display text-2xl font-bold tabular-nums text-foreground">{preview.send}</span>
                <span className="text-[13px] text-muted-foreground">will receive it</span>
              </div>
              {preview.held.length > 0 && (
                <div className="mt-3 border-t border-[var(--rule-soft)] pt-3">
                  <div className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
                    <AlertTriangle className="size-3.5 text-[#a16207]" />
                    {preview.held.length} held back
                  </div>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {preview.held.slice(0, 12).map((person, i) => (
                      <li key={`${person.name}-${i}`} className="text-xs leading-relaxed text-muted-foreground">
                        <span className="text-foreground">{person.name || "Unnamed contact"}</span> — {person.reason}
                      </li>
                    ))}
                  </ul>
                  {preview.held.length > 12 && (
                    <p className="mt-1 text-xs text-[var(--text-tertiary)]">and {preview.held.length - 12} more.</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {!readOnly && (
          <div className="rounded-2xl border border-border bg-white p-4">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input type="checkbox" checked={holdDunning} onChange={(e) => setHoldDunning(e.target.checked)} className="mt-0.5 size-4 accent-[#6b21a8]" />
              <span>
                <span className="block text-[13px] font-medium text-foreground">Hold back accounts with an overdue balance</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  Nobody gets a marketing email from you while you&rsquo;re chasing their invoice. Turn this off only for a
                  message that suits both — a change of hours, say.
                </span>
              </span>
            </label>
          </div>
        )}

        <p className="px-1 text-xs leading-relaxed text-[var(--text-tertiary)]">
          Lists are tags. Add or change who&rsquo;s on one from <Link href="/contacts" className="underline">Contacts</Link>.
        </p>
      </aside>
    </div>
  );
}
