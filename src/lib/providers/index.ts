import { apxledger } from "./apxledger";
import type { AccountingProvider, ProviderId } from "./types";

/*
 * The registry. One line per system Reach can read books from. Xero and
 * QuickBooks appear in the UI as coming soon; implementing them is a new file
 * beside apxledger.ts and an entry here — nothing else changes.
 */
export const providers: Partial<Record<ProviderId, AccountingProvider>> = {
  apxledger,
};

export const comingSoon: { id: ProviderId; label: string }[] = [
  { id: "xero", label: "Xero" },
  { id: "quickbooks", label: "QuickBooks" },
];

export function getProvider(id: string): AccountingProvider | undefined {
  return providers[id as ProviderId];
}

export type { AccountingProvider, ProviderId } from "./types";
