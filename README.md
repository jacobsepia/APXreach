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

## Where things stand (Phase 0)

Built: app shell (rail, topbar), dashboard, contacts, companies, company
record with timeline + books panel, deals board, tasks — read views over the
real schema, seeded with a demo workspace. The Ledger "sync" is seeded data in
`ledger_invoices` / company rollups, shaped exactly like the v1 API serves it.

Next (per the blueprint in the HubSpot project): Better Auth + Sign in with
APX, CRUD + quick-create, the real Ledger sync worker (API key first, OAuth2
when Ledger's consent screen ships, webhooks when Ledger's land), then
sequences and the workflow engine.
