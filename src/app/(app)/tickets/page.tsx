import { EmptyState } from "@/components/ui";

export const metadata = { title: "Tickets" };

export default function TicketsPage() {
  return (
    <EmptyState
      title="Tickets"
      body="Support tickets on the same pipeline engine as deals, with a shared inbox and SLA timers. A ticket from a customer with an open balance says so."
      phase="Arrives in Phase 4 — Service"
    />
  );
}
