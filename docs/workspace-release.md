# Workspace onboarding release — September 5, 2026

The original uncommitted checkout was based on `306a135`. This release merges its unfinished tenancy/onboarding work onto `2933f7b`, preserving the newer contact modal, full email bodies, internal mail composer, CRUD controls, mailbox providers, Ledger identity flow, sync and webhooks.

Already deployed, therefore not overwritten with older files: APX Ledger sign-in, canonical Ledger URLs and OAuth credential diagnostics. The old eagerly-loaded contact modal was also superseded by the deployed on-demand modal. Archives in `_claude_to_delete` remain untouched in the original checkout.

## Completed

- Server-resolved workspace membership for all CRM pages, actions, modal history, mailbox and Ledger connections.
- Public signup with an authenticated workspace setup page. Existing memberships are preserved; no automatic access based on email domain.
- Transactional onboarding with a user-row lock, repeat-submission safety and five default pipeline stages. Transaction behavior follows the [Neon driver documentation](https://neon.com/docs/serverless/serverless-driver).
- Company and pipeline association validation before writes; contact validation before sending mail.
- OAuth handshakes bound to the initiating user/workspace, with correctly scoped cookie cleanup.
- Cron/webhook routes use their own authentication rather than a browser-session redirect. Webhooks select the matching provider and signature among workspace connections.
- Safe local sign-in destinations and recoverable sign-in/signup network errors.

## Validation and deployment

1. `npm run build`
2. `node --env-file=.env.local scripts/test-workspaces.mjs`
3. `node --env-file=.env.local scripts/migrate-workspaces.mjs`
4. Push the reviewed release to the existing GitHub main branch; confirm Vercel reports Ready.
5. Verify the existing signed-in workspace, contacts, email history and settings on the live site.

The test runner creates a uniquely named disposable database on the configured database server, initializes the schema, starts the built app locally, tests independent users and forged requests, then removes only that database. It requires permission to create databases, port 3411 to be free, and a completed build. It never inserts test fixtures in the live database and never sends an email.

The migration only adds membership integrity constraints. Existing production memberships were already present for both existing users. It does not create or assign memberships by guessing account ownership.

Rollback: redeploy the preceding application commit if needed; the additive membership migration can remain. Do not delete memberships, workspaces or customer records as part of a rollback. Once public signup has been used, do not redeploy a single-workspace application without restoring its signup/access restrictions first.
