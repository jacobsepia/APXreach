import { EmptyState } from "@/components/ui";

export const metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <EmptyState
      title="Reports"
      body="Pipeline, activity and revenue dashboards that reconcile against the books — because the revenue numbers come from APX Ledger, not from what the pipeline hopes."
      phase="Grows with every phase"
    />
  );
}
