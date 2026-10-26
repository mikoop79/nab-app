import assert from "node:assert/strict";
import { test } from "node:test";
import { consentWarnings, NoActiveConsentError } from "../src/consent.ts";
import { toExpenses } from "../src/expenses.ts";
import { buildReport, money, renderCsv, renderHtml, renderText } from "../src/report.ts";
import { txn } from "./fixtures.ts";

const week = { start: "2026-10-19", end: "2026-10-25" };
const previousWeek = { start: "2026-10-12", end: "2026-10-18" };

function sample() {
  return toExpenses([
    txn({ amount: "-80.00", postDate: "2026-10-20" }),
    txn({ amount: "-20.00", postDate: "2026-10-24" }),
    txn({ amount: "-15.50", postDate: "2026-10-22", subClass: { title: "Cafes and Restaurants" }, enrich: { merchant: { businessName: "Corner Cafe" } } }),
    txn({ amount: "-50.00", postDate: "2026-10-14" }),
    txn({ amount: "-999.00", postDate: "2026-10-05" }), // outside both weeks
  ]);
}

test("totals, categories and week-on-week change", () => {
  const r = buildReport({ week, previousWeek, expenses: sample() });
  assert.equal(r.totalCents, 11550);
  assert.equal(r.previousTotalCents, 5000);
  assert.equal(r.count, 3);
  assert.deepEqual(r.categories.map((c) => [c.category, c.cents, c.count, c.previousCents]), [
    ["Supermarket and Grocery Stores", 10000, 2, 5000],
    ["Cafes and Restaurants", 1550, 1, 0],
  ]);
  assert.deepEqual(r.merchants[0], { merchant: "Woolworths", cents: 10000, count: 2 });
  assert.equal(r.largest[0]?.amountCents, 8000);
});

test("renders text, html and csv", () => {
  const r = buildReport({ week, previousWeek, expenses: sample(), warnings: ["Expires soon"] });
  const text = renderText(r);
  assert.match(text, /Total: \$115\.50 across 3 transactions \(previous week \$50\.00, \+131%\)/);
  assert.match(text, /Expires soon/);
  assert.match(renderHtml(r), /\$115\.50 spent/);
  const csv = renderCsv(r.expenses).trim().split("\n");
  assert.equal(csv.length, 4);
  assert.equal(csv[0], "date,merchant,category,amount,description,kind,account,id");
});

test("csv escapes quotes, commas and spreadsheet formulas", () => {
  const [e] = toExpenses([txn({ description: '=HYPERLINK("x"), "bad"', enrich: { merchant: { businessName: "A, B" } } })]);
  const row = renderCsv([e!]).split("\n")[1]!;
  assert.match(row, /"A, B"/);
  assert.match(row, /"'=HYPERLINK\(""x""\), ""bad"""/);
});

test("money formats Australian dollars", () => {
  assert.equal(money(123456), "$1,234.56");
  assert.equal(money(-5), "-$0.05");
});

test("consent warnings", () => {
  const now = new Date("2026-10-26T00:00:00Z");
  assert.throws(() => consentWarnings([], now), NoActiveConsentError);
  assert.throws(() => consentWarnings([{ type: "consent", id: "c", status: "expired" }], now), NoActiveConsentError);
  assert.deepEqual(consentWarnings([{ type: "consent", id: "c", status: "active", expiryDate: "2027-06-01T00:00:00Z" }], now), []);
  const [w] = consentWarnings([{ type: "consent", id: "c", status: "active", expiryDate: "2026-11-10T00:00:00Z" }], now);
  assert.match(w!, /expires in 15 days \(2026-11-10\)/);
});
