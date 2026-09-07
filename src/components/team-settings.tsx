"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, LoaderCircle, UserPlus } from "lucide-react";
import { field, label } from "@/components/record-forms";
import { inviteMember, removeMember, revokeInvite, setMemberRole, type InviteOutcome } from "@/lib/team-actions";
import { roles } from "@/lib/team-rules";

/*
 * The Team card on Settings: who is in, who is invited, and the form that
 * invites the next person. Owners see the controls; members see the list.
 */

export type TeamMember = { userId: string; name: string; email: string; role: string; joinedAt: string };
export type TeamInvite = { id: string; email: string; role: string; token: string; expiresAt: string; invitedBy: string | null; status: string };

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { window.prompt("Copy this link", link); } }}
      className="flex h-7 items-center gap-1 rounded-[8px] border border-input bg-white px-2 text-xs font-medium text-foreground hover:border-[#6b21a8]"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      <span>{copied ? "Copied" : "Copy link"}</span>
    </button>
  );
}

export function TeamSettings({ members, invites, currentUserId, isOwner, origin }: { members: TeamMember[]; invites: TeamInvite[]; currentUserId: string; isOwner: boolean; origin: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InviteOutcome | null>(null);
  const router = useRouter();
  const stamp = (iso: string) => new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" }).format(new Date(iso));

  return (
    <div className="mt-3 flex flex-col gap-4 text-[13px]">
      <div className="flex flex-col">
        {members.map((member, index) => (
          <div key={member.userId} className={`flex items-center justify-between gap-3 py-2 ${index < members.length - 1 ? "border-b border-[var(--rule-soft)]" : ""}`}>
            <div className="min-w-0">
              <div className="truncate font-medium text-foreground">{member.name}{member.userId === currentUserId ? " (you)" : ""}</div>
              <div className="truncate text-xs text-[var(--text-tertiary)]">{member.email} · joined {stamp(member.joinedAt)}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isOwner ? (
                <form action={setMemberRole}>
                  <input type="hidden" name="userId" value={member.userId} />
                  <select name="role" defaultValue={member.role} onChange={(event) => event.currentTarget.form?.requestSubmit()} className="h-7 rounded-[8px] border border-input bg-white px-2 text-xs" aria-label={`Role for ${member.name}`}>
                    {roles.map((role) => <option key={role} value={role}>{role === "owner" ? "Owner" : "Member"}</option>)}
                  </select>
                </form>
              ) : (
                <span className="text-xs text-[var(--text-tertiary)]">{member.role === "owner" ? "Owner" : "Member"}</span>
              )}
              {isOwner && (
                <form action={removeMember} onSubmit={(event) => { if (!window.confirm(member.userId === currentUserId ? "Leave this workspace?" : `Remove ${member.name} from the workspace?`)) event.preventDefault(); }}>
                  <input type="hidden" name="userId" value={member.userId} />
                  <button type="submit" className="h-7 rounded-[8px] border border-input bg-white px-2 text-xs font-medium text-muted-foreground hover:border-[var(--accent-hot)] hover:text-[#b91c1c]">{member.userId === currentUserId ? "Leave" : "Remove"}</button>
                </form>
              )}
            </div>
          </div>
        ))}
      </div>

      {invites.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">Invited</div>
          <div className="flex flex-col">
            {invites.map((invite, index) => (
              <div key={invite.id} className={`flex items-center justify-between gap-3 py-2 ${index < invites.length - 1 ? "border-b border-[var(--rule-soft)]" : ""}`}>
                <div className="min-w-0">
                  <div className="truncate text-foreground">{invite.email}</div>
                  <div className="truncate text-xs text-[var(--text-tertiary)]">
                    {invite.role === "owner" ? "Owner" : "Member"}{invite.invitedBy ? ` · invited by ${invite.invitedBy}` : ""} · {invite.status === "expired" ? "expired" : `expires ${stamp(invite.expiresAt)}`}
                  </div>
                </div>
                {isOwner && (
                  <div className="flex shrink-0 items-center gap-2">
                    {invite.status === "pending" && <CopyLink link={`${origin}/invite/${invite.token}`} />}
                    <form action={revokeInvite}>
                      <input type="hidden" name="inviteId" value={invite.id} />
                      <button type="submit" className="h-7 rounded-[8px] border border-input bg-white px-2 text-xs font-medium text-muted-foreground hover:border-[var(--accent-hot)] hover:text-[#b91c1c]">Withdraw</button>
                    </form>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {isOwner && (
        <form
          className="flex flex-col gap-2 rounded-[12px] border border-[var(--rule-soft)] bg-[#fdfbff] p-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            const form = new FormData(event.currentTarget);
            setBusy(true); setResult(null);
            const outcome = await inviteMember(form);
            setBusy(false); setResult(outcome);
            if (outcome.ok) { event.currentTarget.reset(); router.refresh(); }
          }}
        >
          <div className="grid grid-cols-[minmax(0,1fr)_120px_auto] items-end gap-2 max-md:grid-cols-1">
            <div className="flex flex-col gap-1">
              <span className={label}>Invite by email</span>
              <input name="email" type="email" required placeholder="colleague@yourcompany.ca" className={field} />
            </div>
            <div className="flex flex-col gap-1">
              <span className={label}>Role</span>
              <select name="role" defaultValue="member" className={field}>
                <option value="member">Member</option>
                <option value="owner">Owner</option>
              </select>
            </div>
            <button type="submit" disabled={busy} className="flex h-9 items-center gap-1.5 rounded-[10px] bg-[image:var(--gradient-cta)] px-3.5 text-[13px] font-medium text-white disabled:opacity-60">
              {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
              <span>{busy ? "Inviting…" : "Invite"}</span>
            </button>
          </div>
          {result && !result.ok && <p role="alert" className="text-xs font-medium text-[#b91c1c]">{result.error}</p>}
          {result?.ok && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#3f6212]">
              <span>{result.message}</span>
              {!result.sent && <CopyLink link={result.link} />}
            </div>
          )}
          <p className="text-xs text-[var(--text-tertiary)]">Members see and edit everything in the workspace. Owners can also manage the team, the books connection and templates. The invitation goes from your connected mailbox.</p>
        </form>
      )}
    </div>
  );
}
