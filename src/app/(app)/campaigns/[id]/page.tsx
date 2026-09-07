import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Trash2 } from "lucide-react";
import { requireTenant } from "@/lib/workspace";
import { workspaceTags } from "@/lib/tags";
import { campaignById, campaignResults, previewAudience } from "@/lib/campaigns/store";
import { bulkSendingHint, bulkSendingReady } from "@/lib/campaigns/send";
import { deleteCampaign } from "@/lib/campaigns/actions";
import CampaignEditor from "@/components/campaign-editor";
import { Card, Pill } from "@/components/ui";

/*
 * One campaign: written and previewed while it is a draft, then the record of
 * what actually happened once it has gone. A sent campaign is never editable —
 * the copy people received is the copy this page shows.
 */

export const dynamic = "force-dynamic";

const stamp = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short" });

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { workspaceId } = await requireTenant();
  const { id } = await params;
  const campaign = await campaignById(workspaceId, id);
  return { title: campaign?.name ?? "Campaign" };
}

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { workspaceId } = await requireTenant();
  const { id } = await params;
  const { sent, error } = await searchParams;
  const campaign = await campaignById(workspaceId, id);
  if (!campaign) notFound();

  const [lists, preview, results] = await Promise.all([
    workspaceTags(workspaceId),
    campaign.status === "draft" ? previewAudience(workspaceId, campaign.tagId, campaign.holdDunning) : Promise.resolve({ send: [], held: [] }),
    campaign.status === "draft" ? Promise.resolve([]) : campaignResults(campaign.id),
  ]);

  const delivered = results.filter((row) => row.status === "sent");
  const failed = results.filter((row) => row.status === "failed");
  const held = results.filter((row) => row.status === "held");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href="/campaigns" className="mb-1 flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-foreground">
            <ArrowLeft className="size-3" />
            Campaigns
          </Link>
          <h1 className="font-display text-2xl font-bold tracking-[-0.035em] text-foreground">{campaign.name}</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {campaign.status === "draft"
              ? "Nothing leaves until you press Send, and you'll see exactly who it reaches first."
              : `Sent ${campaign.sentAt ? stamp.format(campaign.sentAt) : ""} — ${campaign.sentCount} delivered${campaign.failedCount ? `, ${campaign.failedCount} failed` : ""}${campaign.heldCount ? `, ${campaign.heldCount} held back` : ""}.`}
          </p>
        </div>
        {campaign.status === "draft" && (
          <form action={deleteCampaign}>
            <input type="hidden" name="campaignId" value={campaign.id} />
            <button
              type="submit"
              className="flex h-8 items-center gap-1.5 rounded-[10px] border border-input bg-white px-3 text-[13px] font-medium text-muted-foreground hover:border-[var(--accent-hot)] hover:text-[#b91c1c]"
            >
              <Trash2 className="size-3.5" />
              Delete draft
            </button>
          </form>
        )}
      </div>

      {sent && (
        <Card className="border-[#d9f0a8] bg-[#f7fceb] p-4">
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-[#4d7c0f]">
            <Check className="size-4" />
            Sent. {campaign.sentCount} {campaign.sentCount === 1 ? "person" : "people"} received it.
          </div>
        </Card>
      )}
      {(error || (campaign.status === "draft" && campaign.lastError)) && (
        <Card className="border-[#fecaca] bg-[#fef2f2] p-4">
          <p className="text-[13px] text-[#b91c1c]">{error ?? campaign.lastError}</p>
        </Card>
      )}

      {campaign.status === "draft" ? (
        <CampaignEditor
          campaign={{
            id: campaign.id, name: campaign.name, subject: campaign.subject, bodyHtml: campaign.bodyHtml,
            tagId: campaign.tagId, fromName: campaign.fromName, fromEmail: campaign.fromEmail,
            replyTo: campaign.replyTo, holdDunning: campaign.holdDunning, status: campaign.status,
          }}
          lists={lists.filter((tag) => tag.count > 0 || tag.id === campaign.tagId).map((tag) => ({ id: tag.id, name: tag.name, count: tag.count }))}
          initialPreview={{ send: preview.send.length, held: preview.held.map((person) => ({ name: person.name, reason: person.reason })) }}
          canSend={bulkSendingReady()}
          sendingHint={bulkSendingHint()}
        />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-4 max-xl:grid-cols-1">
          <Card className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">What was sent</div>
            <div className="mt-2 font-display text-[15px] font-semibold text-foreground">{campaign.subject}</div>
            <div className="mt-1 text-xs text-[var(--text-tertiary)]">
              From {campaign.fromName} &lt;{campaign.fromEmail}&gt;{campaign.replyTo ? ` · replies to ${campaign.replyTo}` : ""}
            </div>
            <div
              className="prose-email mt-4 border-t border-[var(--rule-soft)] pt-4 text-[13px] leading-relaxed text-foreground [&_a]:text-[#6b21a8] [&_a]:underline [&_li]:ml-4 [&_ol]:list-decimal [&_p]:mb-3 [&_ul]:list-disc"
              dangerouslySetInnerHTML={{ __html: campaign.bodyHtml }}
            />
          </Card>

          <aside className="flex flex-col gap-3">
            <Card className="p-4">
              <div className="font-display text-[14px] font-semibold text-foreground">Result</div>
              <div className="mt-3 flex flex-col gap-2 text-[13px]">
                <span className="flex items-center justify-between"><span className="text-muted-foreground">Delivered</span><span className="font-medium tabular-nums text-foreground">{campaign.sentCount}</span></span>
                <span className="flex items-center justify-between"><span className="text-muted-foreground">Failed</span><span className="font-medium tabular-nums text-foreground">{campaign.failedCount}</span></span>
                <span className="flex items-center justify-between"><span className="text-muted-foreground">Held back</span><span className="font-medium tabular-nums text-foreground">{campaign.heldCount}</span></span>
              </div>
              {campaign.lastError && <p className="mt-3 border-t border-[var(--rule-soft)] pt-3 text-xs text-[#b91c1c]">{campaign.lastError}</p>}
            </Card>

            {[
              { title: "Failed", rows: failed, tone: "overdue" as const },
              { title: "Held back", rows: held, tone: "warning" as const },
              { title: "Delivered", rows: delivered, tone: "customer" as const },
            ]
              .filter((group) => group.rows.length)
              .map((group) => (
                <Card key={group.title} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-display text-[14px] font-semibold text-foreground">{group.title}</div>
                    <Pill kind={group.tone}>{group.rows.length}</Pill>
                  </div>
                  <ul className="mt-2 flex flex-col gap-1">
                    {group.rows.slice(0, 25).map((row) => (
                      <li key={row.id} className="text-xs leading-relaxed">
                        <Link href={`/contacts/${row.contactId}`} className="text-foreground hover:underline">
                          {`${row.firstName} ${row.lastName}`.replace(/ —$/, "").trim() || row.email}
                        </Link>
                        {row.reason && <span className="text-muted-foreground"> — {row.reason}</span>}
                      </li>
                    ))}
                  </ul>
                  {group.rows.length > 25 && <p className="mt-1 text-xs text-[var(--text-tertiary)]">and {group.rows.length - 25} more.</p>}
                </Card>
              ))}
          </aside>
        </div>
      )}
    </div>
  );
}
