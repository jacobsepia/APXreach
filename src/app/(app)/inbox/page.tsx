import { EmptyState } from "@/components/ui";

export const metadata = { title: "Inbox" };

export default function InboxPage() {
  return (
    <EmptyState
      title="Inbox"
      body="One-to-one email from records — sent through Resend, logged to the timeline, with opens and clicks. A reply or a payment ends a sequence automatically."
      phase="Arrives in Phase 2 — Sales tools"
    />
  );
}
