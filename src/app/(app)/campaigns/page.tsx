import Link from "next/link";
import { Megaphone, Send, Users } from "lucide-react";
import { requireTenant } from "@/lib/workspace";
import { workspaceTags } from "@/lib/tags";
import { workspaceCampaigns } from "@/lib/campaigns/store";
import { bulkSendingHint } from "@/lib/campaigns/send";
import { createCampaign } from "@/lib/campaigns/actions";
import { Card, Pill } from "@/components/ui";

/*
 * Campaigns: one email to a list. The page says up front what makes it
 * different from a marketing tool bolted on beside a CRM — the books decide
 * who is left out — because that rule is the reason to send from here at all.
 */

export const dynamic = "force-dynamic";

export const metadata = { title: "Campaigns" };

const stamp = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" });

const statusPill = {
  draft: { kind: "lead" as const, label: "Draft" },
  sending: { kind: "opportunity" as const, label: "Sending" },
  sent: { kind: "customer" as const, label: "Sent" },
  failed: { kind: "overdue" as const, label: "Failed" },
};

export default async function CampaignsPage() {
  const { workspaceId } = await requireTenant();
  const [campaigns, tags] = await Promise.all([workspaceCampaigns(workspaceId), workspaceTags(workspaceId)]);
  const hint = bulkSendingHint();
  const lists = tags.filter((tag) => tag.count > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-[-0.035em]">
            <span className="gradient-text-flow">Campaigns</span>
          </h1>
          <p className="mt-0.5 max-w-2xl text-[13px] text-muted-foreground">
            One email to a list, through a sending service so your own mailbox never carries bulk mail. Anyone whose
            company has an overdue balance is held back automatically — you don&rsquo;t chase an invoice on Tuesday and
            offer a discount on Wednesday.
          </p>
        </div>
        <form action={createCampaign} className="flex items-center gap-2">
          <input
            name="name"
            required
            maxLength={120}
            placeholder="Name this campaign…"
            aria-label="Campaign name"
            className="h-8 w-56 rounded-[10px] border border-input bg-white px-3 text-[13px] text-foreground placeholder:text-[var(--text-tertiary)] focus:border-[#6b21a8] focus:outline-none"
          />
          <button
            type="submit"
            className="flex h-8 items-center gap-1.5 rounded-[10px] bg-[image:var(--gradient-cta)] px-3.5 text-[13px] font-medium text-white"
          >
            <Megaphone className="size-3.5" />
            New campaign
          </button>
        </form>
      </div>

      {hint && (
        <Card className="border-[#fde68a] bg-[#fffbeb] p-4">
          <div className="text-[13px] font-medium text-[#92400e]">Sending isn&rsquo;t set up yet</div>
          <p className="mt-1 text-[13px] leading-relaxed text-[#a16207]">{hint}</p>
          <p className="mt-1.5 text-xs text-[#a16207]">
            You can write and preview campaigns now; Send turns on the moment the key is set.
          </p>
        </Card>
      )}

      {!lists.length && (
        <Card className="p-4">
          <div className="text-[13px] font-medium text-foreground">There are no lists yet</div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            A campaign goes to everyone carrying a tag. Tag a few people on{" "}
            <Link href="/contacts" className="underline">Contacts</Link> and they become a list here.
          </p>
        </Card>
      )}

      <Card index={0} className="overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div className="font-display text-[15px] font-semibold text-foreground">All campaigns</div>
          <span className="text-xs text-[var(--text-tertiary)]">
            {campaigns.length} {campaigns.length === 1 ? "campaign" : "campaigns"}
          </span>
        </div>
        {!campaigns.length ? (
          <p className="px-5 pb-5 text-[13px] text-muted-foreground">
            Nothing here yet. Name one above and you get an editor, an audience preview, and a Send that tells you who is
            being left out and why before anything leaves.
          </p>
        ) : (
          <div className="flex flex-col">
            <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_150px_100px_minmax(0,1fr)] items-center gap-3 border-b border-[var(--rule-soft)] px-5 pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
              <span>Campaign</span>
              <span>Subject</span>
              <span>List</span>
              <span>Status</span>
              <span>Result</span>
            </div>
            {campaigns.map((campaign, i) => {
              const pill = statusPill[campaign.status as keyof typeof statusPill] ?? statusPill.draft;
              return (
                <Link
                  key={campaign.id}
                  href={`/campaigns/${campaign.id}`}
                  className={`grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_150px_100px_minmax(0,1fr)] items-center gap-3 px-5 py-2.5 text-[13px] hover:bg-[var(--tint-soft)] ${i < campaigns.length - 1 ? "border-b border-[var(--rule-soft)]" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{campaign.name}</span>
                    <span className="block text-xs text-[var(--text-tertiary)]">
                      {campaign.sentAt ? `Sent ${stamp.format(campaign.sentAt)}` : `Created ${stamp.format(campaign.createdAt)}`}
                    </span>
                  </span>
                  <span className="truncate text-muted-foreground">{campaign.subject}</span>
                  <span className="min-w-0 truncate text-muted-foreground">
                    {campaign.tagName ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="size-3.5 text-[var(--text-tertiary)]" />
                        {campaign.tagName}
                      </span>
                    ) : (
                      <span className="text-[var(--text-tertiary)]">No list yet</span>
                    )}
                  </span>
                  <span><Pill kind={pill.kind}>{pill.label}</Pill></span>
                  <span className="min-w-0 text-[var(--text-tertiary)]">
                    {campaign.status === "sent" || campaign.status === "failed" ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Send className="size-3.5" />
                        {campaign.sentCount} sent
                        {campaign.failedCount ? ` · ${campaign.failedCount} failed` : ""}
                        {campaign.heldCount ? ` · ${campaign.heldCount} held` : ""}
                      </span>
                    ) : campaign.lastError ? (
                      <span className="block truncate text-[#b91c1c]" title={campaign.lastError}>{campaign.lastError}</span>
                    ) : (
                      "—"
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
