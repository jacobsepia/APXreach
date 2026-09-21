# Prospect workspace — first release

This release starts the prospecting build on `7ee964b`, preserving the deployed CRM's sequences, reports, tags, campaigns and workspace switching.

## Included

- XLSX preview and atomic import into workspace-scoped research records. Supports the APX workbook's three sheet layouts, up to 2,000 total rows / 3 MB. Every named column is preserved as an original value, including unknown columns.
- File-hash repeat-import protection. Revised files remain separate research batches; this release does not silently merge or overwrite research across workbook versions.
- Active, fit-5, research, microbusiness, follow-up and excluded views; search, source-list filtering and 50-row pagination.
- Research detail, original values, editable fit/rationale, review notes, status, owner and dated next action.
- Explicit company linking/creation, with unique case-insensitive name or domain matching. Multiple matches are blocked for review. No customer or Ledger fields are overwritten. Primary contact names remain intact rather than guessing surname boundaries.
- Linked research on the company page and explicit creation/update of a follow-up in Tasks. Repeated clicks do not duplicate the task; completed tasks are not reopened.
- No automatic email, sequence enrollment, finance-contact creation or deal creation.

## Deployment

1. Run `npm run build` and `node --import tsx scripts/test-prospect-workbook.ts [optional workbook path]`.
2. With database-admin credentials available locally, run `node --env-file=.env scripts/test-workspaces.mjs`. It creates and removes only its uniquely named disposable database; it never imports into the live workspace or sends mail.
3. Apply `node --env-file=.env scripts/migrate-prospects.mjs` to the intended database **before** deploying the new app. The company detail page reads the new research table.
4. Deploy the reviewed branch. Open Prospects, preview the workbook, then import into the selected workspace.
5. Check 430 Ranked Prospects + 179 Microbusinesses + 47 Skipped = 656 source rows for the v5 workbook. These are research rows, not unique companies. Re-importing the identical file should add zero rows.

Rollback the app by redeploying the previous version. Leave the additive prospect tables in place to preserve research. No destructive rollback script is supplied.

## Following increments

This is the foundation, not the entire platform plan. Next: explicit multi-candidate merge resolution, import history and reversible batch handling, normalized service pricing and employee ranges, structured dated evidence, contact enrichment, configurable scoring, saved custom filters, and source-to-revenue reporting. Finance leads and list names are preserved in research but are not yet separate linked entities. Next actions can be sent to Tasks explicitly; they are not silently rescheduled after every research edit.

The workbook is treated as data. Its statements are unverified research, not instructions or confirmed facts. “None found” is displayed as no finance lead found in research.

## Validation notes

The production build, original CRM/workspace integration suite, new prospect integration scenarios, and actual v5 workbook parser checks passed. List and detail screens were visually reviewed in the isolated test app. The test database was disposable; production data was not migrated or imported.

The production release updates Next.js to 16.3.5, resolving the critical/high Next.js and bundled image/CSS dependency advisories reported by npm. Four moderate advisory entries remain in the existing drizzle-kit/esbuild tooling chain; the vulnerable development-server feature is not used by the production app. The new ExcelJS dependency uses a patched UUID override.
