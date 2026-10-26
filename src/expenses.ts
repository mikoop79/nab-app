import type { BasiqTransaction } from "./basiq/types.ts";
import { toSydneyDate } from "./week.ts";

export interface Expense {
  id: string;
  /** Sydney date, YYYY-MM-DD */
  date: string;
  description: string;
  merchant: string;
  category: string;
  /** Money spent, in cents, always positive. */
  amountCents: number;
  account: string;
  /** Basiq's transaction class, e.g. payment, transfer, bank-fee. */
  kind: string;
}

/** Days apart that a debit and credit can be and still count as one transfer between your own accounts. */
const TRANSFER_WINDOW_DAYS = 3;

/**
 * Turns raw Basiq transactions into expenses: posted money going out, minus
 * transfers between your own accounts (which aren't spending).
 */
export function toExpenses(transactions: BasiqTransaction[]): Expense[] {
  const posted = transactions.filter((t) => t.status === "posted");
  const internal = findInternalTransfers(posted);

  return posted
    .filter((t) => t.direction === "debit" && !internal.has(t.id))
    .map(toExpense)
    .filter((e) => e.amountCents > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

function toExpense(t: BasiqTransaction): Expense {
  return {
    id: t.id,
    date: toSydneyDate(dateOf(t)),
    description: t.description.trim(),
    merchant: t.enrich?.merchant?.businessName?.trim() || cleanDescription(t.description),
    category: categoryOf(t),
    amountCents: Math.abs(toCents(t.amount)),
    account: t.account,
    kind: t.class,
  };
}

function categoryOf(t: BasiqTransaction): string {
  const anzsic = t.enrich?.category?.anzsic;
  const title =
    t.subClass?.title ??
    anzsic?.class?.title ??
    anzsic?.group?.title ??
    anzsic?.subdivision?.title;
  if (title) return title;
  switch (t.class) {
    case "transfer":
      return "Transfers out";
    case "cash-withdrawal":
      return "Cash withdrawals";
    case "bank-fee":
      return "Bank fees";
    case "loan-repayment":
      return "Loan repayments";
    case "loan-interest":
    case "interest":
      return "Interest";
    default:
      return "Uncategorised";
  }
}

/**
 * Finds debits that are matched by a credit of the same amount into another
 * of your accounts within a few days. Each credit matches at most one debit.
 */
function findInternalTransfers(posted: BasiqTransaction[]): Set<string> {
  const credits = posted.filter((t) => t.direction === "credit" && t.class === "transfer");
  const used = new Set<string>();
  const internal = new Set<string>();

  for (const debit of posted) {
    if (debit.direction !== "debit" || debit.class !== "transfer") continue;
    const cents = Math.abs(toCents(debit.amount));
    const day = dayNumber(debit);
    const match = credits.find(
      (c) =>
        !used.has(c.id) &&
        c.account !== debit.account &&
        Math.abs(toCents(c.amount)) === cents &&
        Math.abs(dayNumber(c) - day) <= TRANSFER_WINDOW_DAYS,
    );
    if (match) {
      used.add(match.id);
      internal.add(debit.id);
    }
  }
  return internal;
}

function dateOf(t: BasiqTransaction): string {
  return t.postDate ?? t.transactionDate ?? "";
}

function dayNumber(t: BasiqTransaction): number {
  return Date.parse(`${toSydneyDate(dateOf(t))}T00:00:00Z`) / 86_400_000;
}

export function toCents(amount: string): number {
  return Math.round(Number.parseFloat(amount) * 100);
}

/** "VISA PURCHASE  WOOLWORTHS 1234 SYDNEY AU" -> "WOOLWORTHS 1234 SYDNEY AU" */
function cleanDescription(description: string): string {
  return (
    description
      .replace(/^(visa|eftpos|debit card)?\s*(purchase|payment)\s*/i, "")
      .replace(/\s+/g, " ")
      .trim() || description.trim()
  );
}
