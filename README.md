# APX Reach

The CRM that knows your books. A sibling of [APX Ledger](https://apxledger.ca) —
separate product, same platform: contacts, companies, deals and follow-up,
connected to Ledger so the pipeline and the books agree.

## Stack

Deliberately identical to APX Ledger: Next.js 16 (App Router), React 19,
TypeScript, Tailwind CSS 4, Drizzle ORM on Neon Postgres, deployed on Vercel.
`src/app/globals.css` is Ledger's design system, ported verbatim. Money is
integer cents; lime (`--accent-data`) is reserved for figures synced from
Ledger.

## Running it

```
npm install
cp .env.example .env      # set DATABASE_URL to a Neon Postgres URL
npm run db:push           # create the schema
npm run db:seed           # demo workspace (Sepia Consulting)
npm run dev
```

## Where things stand (Phase 1)

Built on top of the Phase 0 read views: quick-create everywhere (contact,
company, deal, task — from the topbar's New menu and per-page buttons), task
completion, deal stage moves from the board (won stages set `wonAt` and light
the Ledger hand-off chip), a timeline composer on company records, and the
**real Ledger sync**: Settings → paste a company-scoped API key from Ledger's
Settings → API access; Reach validates it against `/api/v1/connections`, then
Sync Now walks contacts and receivable invoices, creates/updates companies,
mirrors open invoices, and rolls up outstanding / overdue / revenue-YTD.
Until a key is connected, the seeded demo figures stand in.

Next (per the blueprint in the HubSpot project): Better Auth + Sign in with
APX before any real data, scheduled sync (Inngest or Vercel cron), editing and
deleting records, then Phase 2 sales tools (email via Resend, sequences, the
workflow engine).
