# nab-app

Pulls your NAB expenses every week and emails you a spending report. It needs
no input from you after a one-off setup.

NAB has no public API for personal accounts, so this goes through
[Basiq](https://basiq.io), an accredited Australian Open Banking (Consumer
Data Right) provider. You approve access once on NAB's own consent screen, and
the approval lasts up to 12 months. The weekly job warns you 30 days before it
expires and emails you a fresh link if it lapses.

## What you get

Every Monday morning (Sydney time), an email covering the previous
Monday–Sunday:

- total spend and the change from the week before
- spend by category, with last week alongside
- top 10 merchants and the 10 largest transactions
- a CSV of every expense in the week

Counted as expenses: posted money going out. Left out: income, pending
transactions, and transfers between your own accounts (a debit matched by a
credit of the same amount into another of your accounts within 3 days).
Transfers to other people, such as rent, are kept as "Transfers out".

> **This repo is public.** Reports are emailed, never committed, and the job
> logs only show counts. Keep every key and address in GitHub **secrets**,
> not in code or workflow files.

## One-off setup (about 15 minutes)

1. **Basiq API key.** Sign up at the [Basiq dashboard](https://dashboard.basiq.io),
   create an application and copy its API key. Check which plan you need for
   real (not sandbox) bank data.
2. **Email sending.** Any SMTP account works. For Gmail, turn on 2-step
   verification, then create an [app password](https://myaccount.google.com/apppasswords).
3. **GitHub secrets.** Under *Settings → Secrets and variables → Actions*, add:

   | Secret          | Value                                              |
   | --------------- | -------------------------------------------------- |
   | `BASIQ_API_KEY` | your Basiq API key                                  |
   | `REPORT_TO`     | where reports go (also used as your Basiq login email) |
   | `SMTP_HOST`     | e.g. `smtp.gmail.com`                               |
   | `SMTP_PORT`     | `465` (optional, the default)                       |
   | `SMTP_USER`     | e.g. your Gmail address                             |
   | `SMTP_PASS`     | the app password                                    |

4. **Connect NAB.** In the *Actions* tab, run **Reconnect NAB**. You'll get an
   email with your Basiq user ID and an approval link (valid for about an
   hour). Add the ID as the `BASIQ_USER_ID` secret, open the link, pick NAB,
   log in and **choose 12 months** for how long to share.
5. **Test it.** Run **Weekly NAB report** from the Actions tab. You should get
   the email within a few minutes. After that it runs by itself every Monday.

Once a year, or whenever an email says so, run **Reconnect NAB** again and
approve on NAB's site. No other upkeep is needed. GitHub normally pauses
schedules in inactive repos after 60 days; the weekly job re-enables itself to
prevent that.

## Running locally

```sh
npm install
export BASIQ_API_KEY=... BASIQ_USER_ID=...
npm run status                       # is NAB sharing approved, and until when?
npm run pull -- --dry-run            # writes last week's report to ./reports instead of emailing
npm run pull -- --today 2026-10-26   # report for the week before a given date
npm run setup -- --email you@example.com   # create the Basiq user and print the approval link
```

Without SMTP settings, local runs save the report to `./reports` (git-ignored).

## Code

```
src/basiq/client.ts   Basiq v3 API: tokens, users, consent link, refresh jobs, paged transactions
src/expenses.ts       raw transactions -> expenses (filters income, pending, internal transfers)
src/report.ts         weekly totals, categories, merchants; text/HTML/CSV rendering
src/consent.ts        expiry warnings
src/deliver.ts        email (SMTP) or local files
src/cli.ts            setup | consent-link | status | pull
.github/workflows/    weekly report, reconnect, CI
```

```sh
npm test && npm run typecheck
```
