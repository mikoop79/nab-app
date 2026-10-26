import type { BasiqTransaction } from "../src/basiq/types.ts";

let n = 0;
export function txn(over: Partial<BasiqTransaction>): BasiqTransaction {
  n += 1;
  return {
    type: "transaction",
    id: `t${n}`,
    status: "posted",
    description: "VISA PURCHASE WOOLWORTHS 1234 SYDNEY",
    amount: "-10.00",
    account: "everyday",
    direction: "debit",
    class: "payment",
    postDate: "2026-10-20",
    transactionDate: "2026-10-20",
    subClass: { title: "Supermarket and Grocery Stores", code: "411" },
    enrich: { merchant: { businessName: "Woolworths" } },
    ...over,
  };
}
