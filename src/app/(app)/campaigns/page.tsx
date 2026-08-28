import { EmptyState } from "@/components/ui";

export const metadata = { title: "Campaigns" };

export default function CampaignsPage() {
  return (
    <EmptyState
      title="Campaigns"
      body="Marketing email to lists, with CASL-grade consent tracking — and one rule HubSpot can't offer: accounts in active dunning are held out of every send, automatically."
      phase="Arrives in Phase 3 — Marketing"
    />
  );
}
