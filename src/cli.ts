#!/usr/bin/env node
// Commands:
//   setup [--email you@example.com] [--mobile +614...]   create your Basiq user and get the NAB approval link
//   consent-link                                       get a fresh NAB approval link (by email in CI)
//   status                                             show whether NAB sharing is approved and when it expires
//   pull [--today YYYY-MM-DD] [--dry-run]              pull last week's expenses and send the report
//
// This repo is public, so in CI nothing about your transactions is printed:
// logs show counts only, and the report goes out by email.

import { parseArgs } from "node:util";
import { BasiqClient, BasiqError } from "./basiq/client.ts";
import { consentWarnings, NoActiveConsentError } from "./consent.ts";
import { mailConfigFromEnv, sendEmail, writeLocal, type Message } from "./deliver.ts";
import { toExpenses } from "./expenses.ts";
import { buildReport, renderCsv, renderHtml, renderText, reportSubject } from "./report.ts";
import { addDays, lastCompleteWeek, previousWeek, todayInSydney } from "./week.ts";

const isCI = process.env.CI === "true";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See README.md for setup.`);
  return value;
}

function client(): BasiqClient {
  return new BasiqClient({ apiKey: required("BASIQ_API_KEY"), baseUrl: process.env.BASIQ_BASE_URL });
}

/** Emails a message if SMTP is set up; otherwise prints it (never in CI, where logs are public). */
async function sendOrPrint(message: Message): Promise<void> {
  const mail = mailConfigFromEnv();
  if (mail) {
    await sendEmail(mail, message);
    console.log(`Emailed "${message.subject}".`);
  } else if (isCI) {
    throw new Error("Email isn't configured (SMTP_* and REPORT_TO secrets), and CI logs are public, so there's nowhere safe to send this.");
  } else {
    console.log(`${message.subject}\n\n${message.text}`);
  }
}

async function consentLinkMessage(basiq: BasiqClient, userId: string, intro: string): Promise<Message> {
  const url = await basiq.getConsentUrl(userId);
  const text =
    `${intro}\n\nApprove NAB data sharing here (choose 12 months when asked how long to share):\n${url}\n\n` +
    `This link expires in about an hour. If it has expired, run the "Reconnect NAB" workflow in GitHub Actions for a new one.\n`;
  return { subject: "Approve NAB data sharing for your weekly expense report", text };
}

async function setup(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, options: { email: { type: "string" }, mobile: { type: "string" } } });
  const basiq = client();
  let userId = process.env.BASIQ_USER_ID;
  let intro = "Your Basiq user is already set up.";
  if (!userId) {
    const email = values.email ?? process.env.REPORT_TO;
    if (!email && !values.mobile) throw new Error("Pass --email and/or --mobile (or set REPORT_TO) to create your Basiq user.");
    const user = await basiq.createUser({ email, mobile: values.mobile });
    userId = user.id;
    intro = `Created your Basiq user. Save this as the BASIQ_USER_ID secret:\n${userId}`;
  }
  await sendOrPrint(await consentLinkMessage(basiq, userId, intro));
}

async function consentLink(): Promise<void> {
  const basiq = client();
  await sendOrPrint(await consentLinkMessage(basiq, required("BASIQ_USER_ID"), "Here's a fresh approval link."));
}

async function status(): Promise<void> {
  const consents = await client().listConsents(required("BASIQ_USER_ID"));
  if (consents.length === 0) console.log("No consents yet. Run setup to approve NAB data sharing.");
  for (const c of consents) console.log(`${c.status}${c.expiryDate ? `, expires ${c.expiryDate.slice(0, 10)}` : ""}`);
}

async function pull(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, options: { today: { type: "string" }, "dry-run": { type: "boolean" } } });
  const basiq = client();
  const userId = required("BASIQ_USER_ID");

  const week = lastCompleteWeek(values.today ?? todayInSydney());
  const prior = previousWeek(week);

  let warnings: string[];
  try {
    warnings = consentWarnings(await basiq.listConsents(userId));
    await basiq.refreshConnections(userId);
  } catch (err) {
    if (err instanceof NoActiveConsentError || (err instanceof BasiqError && err.status !== 0 && err.status < 500)) {
      await alertReconnect(basiq, userId, err as Error);
    }
    throw err;
  }

  // Fetch a few extra days either side so transfers between your accounts can be matched up.
  const transactions = await basiq.listTransactions(userId, addDays(prior.start, -3), addDays(week.end, 3));
  const expenses = toExpenses(transactions);
  const report = buildReport({ week, previousWeek: prior, expenses, warnings });
  console.log(`Week ${week.start} to ${week.end}: ${transactions.length} transactions fetched, ${report.count} expenses in the report.`);

  const message: Message = {
    subject: reportSubject(report),
    text: renderText(report),
    html: renderHtml(report),
    attachments: [{ filename: `nab-expenses-${week.start}.csv`, content: renderCsv(report.expenses) }],
  };

  const mail = mailConfigFromEnv();
  if (mail && !values["dry-run"]) {
    await sendEmail(mail, message);
    console.log("Report emailed.");
  } else if (isCI && !values["dry-run"]) {
    throw new Error("Email isn't configured (SMTP_* and REPORT_TO secrets), so the report can't be delivered.");
  } else if (!isCI) {
    const files = await writeLocal("reports", `nab-expenses-${week.start}`, message);
    console.log(`Report saved to ${files.join(", ")}`);
  }
}

/** Best-effort email when NAB access has lapsed, with a fresh approval link. */
async function alertReconnect(basiq: BasiqClient, userId: string, cause: Error): Promise<void> {
  const mail = mailConfigFromEnv();
  if (!mail) return;
  try {
    const msg = await consentLinkMessage(
      basiq,
      userId,
      `This week's NAB expense report couldn't run: ${cause.message}\nThis usually means the 12-month approval has expired.`,
    );
    await sendEmail(mail, { ...msg, subject: "Action needed: reconnect NAB for your expense report" });
    console.log("Sent a reconnect email.");
  } catch {
    console.log("Couldn't send the reconnect email.");
  }
}

const commands: Record<string, (args: string[]) => Promise<void>> = {
  setup,
  "consent-link": consentLink,
  status,
  pull,
};

const [name = "", ...rest] = process.argv.slice(2);
const command = commands[name];
if (!command) {
  console.error(`Usage: npm run cli -- <${Object.keys(commands).join("|")}> [options]`);
  process.exit(2);
}
command(rest).catch((err: unknown) => {
  // Basiq error bodies can include account details, so they're only shown locally.
  console.error(err instanceof Error ? err.message : String(err));
  if (!isCI && err instanceof BasiqError && err.body) console.error(err.body);
  process.exit(1);
});
