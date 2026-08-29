/*
 * The provider boundary — the same design APX Collect uses for Xero and
 * QuickBooks, with APX Ledger as provider #1. Reach never talks to an
 * accounting system directly: a provider validates credentials and hands back
 * NORMALIZED shapes, and everything past this file is provider-agnostic.
 * Hooking up the next system (Xero, QuickBooks, a future APX product) means
 * implementing this interface and adding one line to the registry.
 */

export type ProviderId = "apxledger" | "xero" | "quickbooks";

export interface ProviderCompany {
  /** The company's id inside the provider. */
  externalId: string;
  name: string;
  currency: string;
  scopes: string[];
}

export interface NormalizedContact {
  externalId: string;
  name: string;
  email: string | null;
  phone: string | null;
  isCustomer: boolean;
}

export interface NormalizedInvoice {
  externalId: string;
  number: string;
  contactExternalId: string;
  issueDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  totalCents: number;
  outstandingCents: number;
  /** True once fully settled; drafts and voids never reach Reach. */
  paid: boolean;
}

export type ProviderResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface AccountingProvider {
  id: ProviderId;
  /** Human name, shown in the UI and on synced-data captions. */
  label: string;
  /** Where credentials come from, shown under the connect form. */
  connectHint: string;
  /** Check the credential and identify the company it opens. */
  validate(credentials: string): Promise<ProviderResult<ProviderCompany>>;
  /** Pull everything the CRM mirrors. Incremental cursors come later. */
  pull(
    credentials: string,
    externalCompanyId: string,
  ): Promise<ProviderResult<{ contacts: NormalizedContact[]; invoices: NormalizedInvoice[] }>>;
}
