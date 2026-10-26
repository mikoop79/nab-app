import assert from "node:assert/strict";
import { test } from "node:test";
import { toCents, toExpenses } from "../src/expenses.ts";
import { txn } from "./fixtures.ts";

test("keeps posted debits and drops credits and pending", () => {
  const expenses = toExpenses([
    txn({ id: "spend", amount: "-42.50" }),
    txn({ id: "pay", amount: "3000.00", direction: "credit", class: "direct-credit" }),
    txn({ id: "pending", status: "pending", postDate: null }),
  ]);
  assert.deepEqual(expenses.map((e) => [e.id, e.amountCents, e.merchant, e.category]), [
    ["spend", 4250, "Woolworths", "Supermarket and Grocery Stores"],
  ]);
});

test("drops transfers between your own accounts but keeps transfers to other people", () => {
  const expenses = toExpenses([
    txn({ id: "to-savings", class: "transfer", amount: "-500.00", account: "everyday", postDate: "2026-10-20", subClass: null }),
    txn({ id: "into-savings", class: "transfer", amount: "500.00", direction: "credit", account: "savings", postDate: "2026-10-21" }),
    txn({ id: "rent", class: "transfer", amount: "-650.00", account: "everyday", subClass: null, enrich: null, description: "Transfer to J Smith rent" }),
  ]);
  assert.deepEqual(expenses.map((e) => [e.id, e.category]), [["rent", "Transfers out"]]);
});

test("a credit only cancels out one matching debit", () => {
  const expenses = toExpenses([
    txn({ id: "a", class: "transfer", amount: "-100.00", account: "everyday" }),
    txn({ id: "b", class: "transfer", amount: "-100.00", account: "everyday" }),
    txn({ id: "c", class: "transfer", amount: "100.00", direction: "credit", account: "savings" }),
  ]);
  assert.equal(expenses.length, 1);
});

test("falls back to the description when Basiq has no merchant", () => {
  const [e] = toExpenses([txn({ enrich: null, subClass: null, class: "bank-fee", description: "VISA PURCHASE  CORNER CAFE  NEWTOWN" })]);
  assert.equal(e?.merchant, "CORNER CAFE NEWTOWN");
  assert.equal(e?.category, "Bank fees");
});

test("toCents avoids floating-point drift", () => {
  assert.equal(toCents("-0.29"), -29);
  assert.equal(toCents("1234.10"), 123410);
});
