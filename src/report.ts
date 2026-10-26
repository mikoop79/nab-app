import type { Expense } from "./expenses.ts";
import type { Week } from "./week.ts";

export interface CategoryLine {
  category: string;
  cents: number;
  count: number;
  previousCents: number;
}

export interface MerchantLine {
  merchant: string;
  cents: number;
  count: number;
}

export interface WeeklyReport {
  week: Week;
  previousWeek: Week;
  totalCents: number;
  previousTotalCents: number;
  count: number;
  categories: CategoryLine[];
  merchants: MerchantLine[];
  largest: Expense[];
  expenses: Expense[];
  warnings: string[];
}

export function buildReport(input: {
  week: Week;
  previousWeek: Week;
  expenses: Expense[];
  warnings?: string[];
}): WeeklyReport {
  const inWeek = (w: Week) => (e: Expense) => e.date >= w.start && e.date <= w.end;
  const current = input.expenses.filter(inWeek(input.week));
  const previous = input.expenses.filter(inWeek(input.previousWeek));

  const categories = new Map<string, CategoryLine>();
  const line = (category: string) => {
    let l = categories.get(category);
    if (!l) categories.set(category, (l = { category, cents: 0, count: 0, previousCents: 0 }));
    return l;
  };
  for (const e of current) {
    const l = line(e.category);
    l.cents += e.amountCents;
    l.count += 1;
  }
  for (const e of previous) line(e.category).previousCents += e.amountCents;

  const merchants = new Map<string, MerchantLine>();
  for (const e of current) {
    const m = merchants.get(e.merchant) ?? { merchant: e.merchant, cents: 0, count: 0 };
    m.cents += e.amountCents;
    m.count += 1;
    merchants.set(e.merchant, m);
  }

  return {
    week: input.week,
    previousWeek: input.previousWeek,
    totalCents: sum(current),
    previousTotalCents: sum(previous),
    count: current.length,
    categories: [...categories.values()].sort((a, b) => b.cents - a.cents || b.previousCents - a.previousCents),
    merchants: [...merchants.values()].sort((a, b) => b.cents - a.cents).slice(0, 10),
    largest: [...current].sort((a, b) => b.amountCents - a.amountCents).slice(0, 10),
    expenses: current,
    warnings: input.warnings ?? [],
  };
}

function sum(expenses: Expense[]): number {
  return expenses.reduce((total, e) => total + e.amountCents, 0);
}

// ---------- Rendering ----------

export function money(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function change(now: number, before: number): string {
  if (before === 0) return now === 0 ? "–" : "new";
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

export function reportSubject(r: WeeklyReport): string {
  return `NAB spending ${r.week.start} to ${r.week.end}: ${money(r.totalCents)}`;
}

export function renderText(r: WeeklyReport): string {
  const out: string[] = [];
  for (const w of r.warnings) out.push(`⚠️  ${w}`, "");
  out.push(
    `Spending for ${r.week.start} to ${r.week.end}`,
    `Total: ${money(r.totalCents)} across ${r.count} transactions (previous week ${money(r.previousTotalCents)}, ${change(r.totalCents, r.previousTotalCents)})`,
    "",
    "By category:",
  );
  for (const c of r.categories) {
    out.push(`  ${c.category}: ${money(c.cents)} (${c.count}) — last week ${money(c.previousCents)}, ${change(c.cents, c.previousCents)}`);
  }
  out.push("", "Top merchants:");
  for (const m of r.merchants) out.push(`  ${m.merchant}: ${money(m.cents)} (${m.count})`);
  out.push("", "Largest transactions:");
  for (const e of r.largest) out.push(`  ${e.date}  ${money(e.amountCents)}  ${e.merchant}`);
  return out.join("\n") + "\n";
}

export function renderHtml(r: WeeklyReport): string {
  const td = 'style="padding:4px 12px 4px 0;border-bottom:1px solid #eee"';
  const tdR = 'style="padding:4px 12px 4px 0;border-bottom:1px solid #eee;text-align:right"';
  const table = (head: string[], rows: string[][], rightFrom: number) =>
    `<table style="border-collapse:collapse;font-size:14px"><tr>${head
      .map((h, i) => `<th ${i >= rightFrom ? tdR : td}>${esc(h)}</th>`)
      .join("")}</tr>${rows
      .map((row) => `<tr>${row.map((c, i) => `<td ${i >= rightFrom ? tdR : td}>${esc(c)}</td>`).join("")}</tr>`)
      .join("")}</table>`;

  const warnings = r.warnings
    .map((w) => `<p style="background:#fff4d6;border:1px solid #f0c040;padding:8px 12px;border-radius:6px">⚠️ ${esc(w)}</p>`)
    .join("");

  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#222;max-width:680px">
${warnings}
<h2 style="margin-bottom:4px">${esc(money(r.totalCents))} spent</h2>
<p style="margin-top:0;color:#555">${esc(r.week.start)} to ${esc(r.week.end)} · ${r.count} transactions · previous week ${esc(money(r.previousTotalCents))} (${esc(change(r.totalCents, r.previousTotalCents))})</p>
<h3>By category</h3>
${table(
  ["Category", "This week", "Count", "Last week", "Change"],
  r.categories.map((c) => [c.category, money(c.cents), String(c.count), money(c.previousCents), change(c.cents, c.previousCents)]),
  1,
)}
<h3>Top merchants</h3>
${table(["Merchant", "Spent", "Count"], r.merchants.map((m) => [m.merchant, money(m.cents), String(m.count)]), 1)}
<h3>Largest transactions</h3>
${table(["Date", "Merchant", "Amount"], r.largest.map((e) => [e.date, e.merchant, money(e.amountCents)]), 2)}
<p style="color:#888;font-size:12px">Every transaction for the week is in the attached CSV.</p>
</body></html>`;
}

export function renderCsv(expenses: Expense[]): string {
  const header = ["date", "merchant", "category", "amount", "description", "kind", "account", "id"];
  const rows = expenses.map((e) => [
    e.date,
    e.merchant,
    e.category,
    (e.amountCents / 100).toFixed(2),
    e.description,
    e.kind,
    e.account,
    e.id,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

function csvCell(value: string): string {
  // Leading = + - @ would run as a formula in Excel/Sheets.
  const safe = /^[=+\-@]/.test(value) && !/^-?\d/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
