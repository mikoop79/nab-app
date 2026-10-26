// Shapes of the Basiq v3 API responses we use. Only the fields we read are
// listed; Basiq returns more.

export interface BasiqList<T> {
  type: "list";
  data: T[];
  links?: { self?: string; next?: string };
}

export interface BasiqTransaction {
  type: "transaction";
  id: string;
  status: "posted" | "pending" | string;
  description: string;
  /** Signed decimal string, e.g. "-12.50" for money out. */
  amount: string;
  account: string;
  direction: "debit" | "credit";
  /** e.g. payment, transfer, cash-withdrawal, bank-fee, interest, refund. */
  class: string;
  institution?: string;
  /** YYYY-MM-DD or ISO timestamp. Pending transactions may have no postDate. */
  postDate?: string | null;
  transactionDate?: string | null;
  subClass?: { title?: string | null; code?: string | null } | null;
  enrich?: {
    merchant?: { businessName?: string | null } | null;
    category?: {
      anzsic?: {
        division?: { title?: string | null } | null;
        subdivision?: { title?: string | null } | null;
        group?: { title?: string | null } | null;
        class?: { title?: string | null } | null;
      } | null;
    } | null;
  } | null;
}

export interface BasiqUser {
  type: "user";
  id: string;
  email?: string;
  mobile?: string;
}

export interface BasiqJob {
  type: "job";
  id: string;
  steps?: { title: string; status: "pending" | "in-progress" | "success" | "failed"; result?: unknown }[];
}

export interface BasiqConsent {
  type: "consent";
  id: string;
  status: "active" | "revoked" | "expired" | string;
  created?: string;
  updated?: string;
  expiryDate?: string | null;
}
