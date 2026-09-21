// End-to-end checks against a disposable database, NEVER against live records.
// Run after npm run build: node --env-file=.env.local scripts/test-workspaces.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { neon } from "@neondatabase/serverless";
import ExcelJS from "exceljs";
import { safeAuthDestination } from "../src/lib/auth-redirect.ts";
const require = createRequire(import.meta.url);
const { encodeReply } = require("next/dist/compiled/react-server-dom-webpack/client.node");
const admin = neon(process.env.DATABASE_URL);
const database = "apxreach_qa_" + randomUUID().replaceAll("-", "");
assert.match(database, /^apxreach_qa_[a-f0-9]{32}$/);
const testUrl = new URL(process.env.DATABASE_URL);
assert.notEqual(testUrl.pathname, "/" + database);
testUrl.pathname = "/" + database;
const query = neon(testUrl.toString());
const origin = "http://localhost:3411";
const env = { ...process.env, DATABASE_URL: testUrl.toString(), BETTER_AUTH_URL: origin,
  APXLEDGER_CLIENT_ID: "qa-only", APXLEDGER_CLIENT_SECRET: "qa-only", ZOHO_CLIENT_ID: "qa-only", ZOHO_CLIENT_SECRET: "qa-only",
  GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", MICROSOFT_CLIENT_ID: "", MICROSOFT_CLIENT_SECRET: "", CRON_SECRET: "qa-only", NODE_ENV: "production" };
let server, created = false;
let logs = "";
const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8")).node;
// Next 16.3 places exportedName on the action rather than each worker.
const references = new Map(Object.entries(manifest).map(([id, entry]) => [entry.exportedName ?? Object.values(entry.workers)[0].exportedName, id]));

async function request(path, cookie = "", init = {}) {
  const response = await fetch(origin + path, { redirect: "manual", ...init,
    headers: { cookie, origin, ...init.headers }, signal: AbortSignal.timeout(45000) });
  return { status: response.status, text: await response.text(), headers: response.headers };
}
async function signup(name) {
  const password = "Test-only-" + randomUUID();
  const result = await request("/api/auth/sign-up/email", "", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, email: name.toLowerCase() + "@example.test", password }) });
  assert.equal(result.status, 200, "Public signup: " + result.text);
  const cookie = result.headers.getSetCookie().map((v) => v.split(";")[0]).join("; ");
  assert.ok(cookie.includes("session_token"));
  return { id: JSON.parse(result.text).user.id, cookie, password };
}
async function action(name, cookie, values, path = "/contacts") {
  assert.ok(references.has(name), "Action exists: " + name);
  const form = typeof values === "string" ? values : Object.assign(new FormData(), {});
  if (typeof values !== "string") for (const [key, value] of Object.entries(values)) form.set(key, value);
  return request(path, cookie, { method: "POST", headers: { "next-action": references.get(name) }, body: await encodeReply([form]) });
}
const passed = (name) => console.log("PASS " + name);
const templateError = (r) => /(?:^|\n)[0-9a-f]+:\{"error":"/.test(r.text);
const ok = (r, name) => { assert.ok(r.status < 400 && !r.text.includes(':E{"digest"') && !templateError(r), name + ": " + r.status + " " + r.text.slice(0, 400)); };
const denied = (r, name) => { assert.ok(r.status >= 400 || r.text.includes(':E{"digest"') || templateError(r), name + " must be denied"); };

try {
  for (const value of [null, "javascript:alert(1)", "https://example.com", "//example.com", "/\\example.com", "/\n/example.com"]) {
    assert.equal(safeAuthDestination(value), "/dashboard");
  }
  assert.equal(safeAuthDestination("/contacts?view=all"), "/contacts?view=all");
  passed("sign-in destinations cannot navigate to external URLs or execute scripts");
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  console.log("Created isolated test database " + database);
  const schema = spawnSync(process.execPath, ["node_modules/drizzle-kit/bin.cjs", "push", "--force"], { env, encoding: "utf8", windowsHide: true });
  assert.equal(schema.status, 0, "Test schema failed: " + schema.stderr);
  const migration = readFileSync("migrations/20260905_workspace_members.sql", "utf8");
  await query.query(migration);
  await query.query(migration);
  passed("membership migration is repeatable");
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3411"], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  for (const stream of [server.stdout, server.stderr]) stream.on("data", (d) => { logs = (logs + d).slice(-16000); });
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { if ((await request("/sign-in")).status === 200) { ready = true; break; } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(ready, "Local app failed to start: " + logs);
  const a = await signup("TenantAlpha"), b = await signup("TenantBeta"), c = await signup("NoWorkspace");
  passed("public email signup and session creation");
  const unowned = await request("/contacts", c.cookie);
  assert.ok(unowned.headers.get("location")?.includes("/welcome") || unowned.text.includes('NEXT_REDIRECT;replace;/welcome'), "Unonboarded account is redirected");
  denied(await action("createContact", c.cookie, { firstName: "Blocked" }), "unonboarded mutation");
  passed("new users cannot read or write CRM records before onboarding");
  const concurrent = await Promise.all([1, 2, 3].map(() => action("createWorkspace", a.cookie, { companyName: "Alpha Workspace" }, "/welcome")));
  for (const result of concurrent) ok(result, "concurrent onboarding");
  ok(await action("createWorkspace", b.cookie, { companyName: "Beta Workspace" }, "/welcome"), "onboard beta");
  const membershipA = await query`SELECT workspace_id FROM workspace_members WHERE user_id = ${a.id}`;
  const membershipB = await query`SELECT workspace_id FROM workspace_members WHERE user_id = ${b.id}`;
  assert.equal(membershipA.length, 1); assert.equal(membershipB.length, 1);
  a.workspace = membershipA[0].workspace_id; b.workspace = membershipB[0].workspace_id;
  assert.notEqual(a.workspace, b.workspace);
  assert.equal(Number((await query`SELECT count(*) FROM workspaces`)[0].count), 2);
  assert.equal(Number((await query`SELECT count(*) FROM pipeline_stages`)[0].count), 10);
  ok(await action("createWorkspace", a.cookie, { companyName: "Do not replace" }, "/welcome"), "repeat onboarding");
  assert.equal(Number((await query`SELECT count(*) FROM workspaces`)[0].count), 2);
  passed("concurrent and repeated onboarding creates exactly one complete workspace per user");
  for (const [kind, provider] of [["integrations", "apxledger"], ["mailboxes", "zoho"]]) {
    const start = await request(`/api/${kind}/${provider}/start`, a.cookie);
    assert.equal(start.status, 303);
    const state = new URL(start.headers.get("location")).searchParams.get("state");
    assert.ok(state?.startsWith(`${a.id}:${a.workspace}:`));
    const handshake = start.headers.getSetCookie().map((v) => v.split(";")[0]).join("; ");
    const callback = await request(`/api/${kind}/${provider}/callback?code=never-exchange&state=${encodeURIComponent(state)}`, b.cookie + "; " + handshake);
    assert.ok(callback.headers.get("location")?.includes("error="));
    assert.ok(callback.headers.getSetCookie().every((v) => v.includes(`Path=/api/${kind}`)));
    const noWorkspace = await request(`/api/${kind}/${provider}/start`, c.cookie);
    assert.ok(noWorkspace.headers.get("location")?.includes("/welcome"));
  }
  assert.equal(Number((await query`SELECT count(*) FROM connections`)[0].count), 0);
  assert.equal(Number((await query`SELECT count(*) FROM mailboxes`)[0].count), 0);
  passed("OAuth state is bound to the initiating user and workspace; callbacks clear scoped cookies");
  for (const [person, label] of [[a, "ALPHA_ONLY"], [b, "BETA_ONLY"]]) {
    ok(await action("createCompany", person.cookie, { name: label }), "create company");
    person.company = (await query`SELECT id FROM companies WHERE workspace_id = ${person.workspace}`)[0].id;
    person.stage = (await query`SELECT s.id FROM pipeline_stages s JOIN pipelines p ON p.id=s.pipeline_id WHERE p.workspace_id=${person.workspace} ORDER BY s.display_order LIMIT 1`)[0].id;
    ok(await action("createContact", person.cookie, { firstName: label, lastName: "Contact", companyId: person.company, email: label.toLowerCase() + "@example.test" }), "create contact");
    person.contact = (await query`SELECT id FROM contacts WHERE workspace_id = ${person.workspace}`)[0].id;
    ok(await action("createDeal", person.cookie, { name: label, companyId: person.company, stageId: person.stage, amount: "100" }), "create deal");
    person.deal = (await query`SELECT id FROM deals WHERE workspace_id = ${person.workspace}`)[0].id;
    ok(await action("createTask", person.cookie, { subject: label, companyId: person.company }), "create task");
    person.task = (await query`SELECT id FROM activities WHERE workspace_id = ${person.workspace} AND type='task'`)[0].id;
    await query`INSERT INTO email_messages (workspace_id,contact_id,company_id,direction,from_address,to_address,subject,body_text) VALUES (${person.workspace},${person.contact},${person.company},'outbound','qa@example.test','recipient@example.test',${label},${label + " full email content"})`;
  }
  passed("in-workspace company, contact, deal and task creation");
  for (const page of ["/dashboard", "/companies", "/contacts", "/deals", "/tasks", "/settings", "/settings/templates", "/companies/" + a.company]) {
    const result = await request(page, a.cookie);
    assert.equal(result.status, 200, page);
    assert.ok(!result.text.includes("BETA_ONLY"), page + " leaked beta records");
  }
  const ownRecord = await action("loadContactRecord", a.cookie, a.contact);
  ok(ownRecord, "own modal"); assert.ok(ownRecord.text.includes("ALPHA_ONLY full email content"));
  assert.ok(!ownRecord.text.includes("BETA_ONLY"));
  denied(await action("loadContactRecord", a.cookie, b.contact), "foreign modal");
  const foreignPage = await request("/companies/" + b.company, a.cookie);
  assert.ok(foreignPage.status === 404 || foreignPage.text.includes("NEXT_HTTP_ERROR_FALLBACK;404"));
  assert.ok(!foreignPage.text.includes("BETA_ONLY"));
  passed("pages, direct company URLs, modal history and email bodies are tenant-scoped");
  const templateMigration = readFileSync("migrations/20260905_email_templates.sql", "utf8");
  await query.query(templateMigration); await query.query(templateMigration);
  const templateFields = { key: "checking-in", name: "Alpha greeting", subject: "Hello {{first_name}}", bodyHtml: "<p>Hi {{first_name}}, from ALPHA_TEMPLATE.</p>", revision: "" };
  for (const [person, address] of [[a, "alpha.sender@example.test"], [b, "beta.sender@example.test"]]) {
    await query`INSERT INTO mailboxes (workspace_id,user_id,provider,provider_label,email_address,status) VALUES (${person.workspace},${person.id},'zoho','QA mailbox',${address},'connected')`;
  }
  const signatureRecord = await action("loadContactRecord", a.cookie, a.contact);
  ok(signatureRecord, "sender signature on contact record");
  assert.ok(signatureRecord.text.includes("alpha.sender@example.test"));
  assert.ok(!signatureRecord.text.includes("beta.sender@example.test"));
  ok(await action("saveEmailTemplate", a.cookie, templateFields, "/settings/templates"), "save workspace template");
  const savedTemplate = (await query`SELECT * FROM email_templates WHERE workspace_id=${a.workspace}`)[0];
  assert.equal(savedTemplate.name, "Alpha greeting");
  denied(await action("saveEmailTemplate", a.cookie, templateFields), "stale template edit");
  const anonymousTemplate = await action("saveEmailTemplate", "", templateFields);
  assert.ok(anonymousTemplate.headers.get("location")?.includes("/sign-in") || anonymousTemplate.text.includes('"error":'), "anonymous template write requires sign-in");
  denied(await action("saveEmailTemplate", b.cookie, { ...templateFields, revision: savedTemplate.revision }), "foreign template revision");
  const alphaDraft = await action("prepareTemplateDraft", a.cookie, { key: "checking-in", contactId: a.contact });
  ok(alphaDraft, "personalized template"); assert.ok(alphaDraft.text.includes("ALPHA_TEMPLATE")); assert.ok(alphaDraft.text.includes("Hi ALPHA_ONLY"));
  const betaDraft = await action("prepareTemplateDraft", b.cookie, { key: "checking-in", contactId: b.contact });
  ok(betaDraft, "beta starter template"); assert.ok(!betaDraft.text.includes("ALPHA_TEMPLATE"));
  denied(await action("prepareTemplateDraft", a.cookie, { key: "checking-in", contactId: b.contact }), "foreign template contact");
  const congrats = await action("prepareTemplateDraft", a.cookie, { key: "congratulations", contactId: a.contact });
  ok(congrats, "missing milestone prompt"); assert.ok(congrats.text.includes('"missing":["milestone"]'));
  assert.ok(congrats.text.includes("Alpha Workspace"));
  assert.ok(congrats.text.includes("alpha.sender@example.test"));
  assert.ok(!congrats.text.includes("beta.sender@example.test"));
  const personalized = await action("prepareTemplateDraft", a.cookie, { key: "congratulations", contactId: a.contact, fields: JSON.stringify({ milestone: "your new office", first_name: "Do not override" }) });
  ok(personalized, "manual milestone"); assert.ok(personalized.text.includes("your new office")); assert.ok(!personalized.text.includes("Do not override"));
  const unsafe = await action("saveEmailTemplate", a.cookie, { ...templateFields, revision: savedTemplate.revision, bodyHtml: '<p>Safe {{first_name}}</p><script>alert(1)</script>' });
  ok(unsafe, "sanitized template"); assert.ok(!(await query`SELECT body_html FROM email_templates WHERE workspace_id=${a.workspace}`)[0].body_html.includes("script"));
  denied(await action("saveEmailTemplate", b.cookie, { ...templateFields, bodyHtml: "<p>{{unknown_tag}}</p>" }), "unknown tag");
  for (const person of [a, b]) {
    await query`INSERT INTO connections (workspace_id,provider,provider_label,company_name,base_currency) VALUES (${person.workspace},'apxledger','QA books','QA','CAD')`;
    await query`INSERT INTO synced_invoices (workspace_id,company_id,number,issued_date,due_date,total_cents,outstanding_cents,status) VALUES (${person.workspace},${person.company},${person === a ? "ALPHA-INV" : "BETA-INV"},'2020-01-01','2020-01-31',12345,12345,'overdue')`;
  }
  const invoicePrompt = await action("prepareTemplateDraft", a.cookie, { key: "invoice-overdue", contactId: a.contact });
  ok(invoicePrompt, "invoice selection"); assert.ok(invoicePrompt.text.includes("ALPHA-INV")); assert.ok(!invoicePrompt.text.includes("BETA-INV"));
  denied(await action("prepareTemplateDraft", a.cookie, { key: "invoice-overdue", contactId: a.contact, invoiceNumber: "BETA-INV" }), "foreign invoice selection");
  const invoiceDraft = await action("prepareTemplateDraft", a.cookie, { key: "invoice-overdue", contactId: a.contact, invoiceNumber: "ALPHA-INV" });
  ok(invoiceDraft, "resolved invoice draft"); assert.ok(invoiceDraft.text.includes("123.45")); assert.ok(invoiceDraft.text.includes("January 31, 2020")); assert.ok(invoiceDraft.text.includes('"missing":[]'));
  denied(await action("prepareTemplateDraft", a.cookie, { key: "invoice-due", contactId: a.contact, invoiceNumber: "ALPHA-INV" }), "overdue invoice in coming-due template");
  denied(await action("sendEmailFromRecord", a.cookie, { contactId: a.contact, companyId: a.company, to: "qa@example.test", subject: "Hi {{first_name}}", body: "Never send" }), "unresolved send tag");
  denied(await action("sendEmailFromRecord", a.cookie, { contactId: a.contact, companyId: a.company, to: "qa@example.test", subject: "Invoice", body: "Never send", templateInvoice: JSON.stringify({ number: "ALPHA-INV", dueDate: "2020-01-31", outstandingCents: 999, mode: "overdue", currency: "CAD" }) }), "changed invoice send");
  passed("templates persist per workspace, protect concurrent edits, resolve tags and reject foreign or stale invoice data");
  const mutations = [
    ["createContact", { firstName: "Attack", companyId: b.company }],
    ["createDeal", { name: "Attack", stageId: b.stage, companyId: a.company }],
    ["createDeal", { name: "Attack", stageId: a.stage, companyId: b.company }],
    ["createTask", { subject: "Attack", companyId: b.company }],
    ["logActivity", { body: "Attack", type: "note", companyId: b.company }],
    ["updateContact", { id: a.contact, firstName: "Attack", companyId: b.company }],
    ["updateContact", { id: b.contact, firstName: "Attack" }],
    ["updateCompany", { id: b.company, name: "Attack" }],
    ["updateDeal", { id: a.deal, name: "Attack", stageId: b.stage }],
    ["updateTask", { id: a.task, subject: "Attack", companyId: b.company }],
    ["setDealStage", { dealId: a.deal, stageId: b.stage }],
    ["deleteCompany", { id: b.company }], ["deleteContact", { id: b.contact }],
    ["deleteDeal", { id: b.deal }], ["deleteTask", { id: b.task }],
    ["sendEmailFromRecord", { contactId: b.contact, companyId: a.company, to: "qa@example.test", subject: "Attack", body: "Never send" }],
    ["disconnectMailbox", { mailboxId: randomUUID() }],
  ];
  for (const [name, values] of mutations) denied(await action(name, a.cookie, values), name);
  // These actions intentionally treat stale IDs as no-ops; verify no foreign write occurred.
  await action("completeTask", a.cookie, { taskId: b.task });
  await action("setDealStage", a.cookie, { dealId: b.deal, stageId: a.stage });
  assert.equal((await query`SELECT completed_at FROM activities WHERE id=${b.task}`)[0].completed_at, null);
  assert.equal((await query`SELECT stage_id FROM deals WHERE id=${b.deal}`)[0].stage_id, b.stage);
  assert.equal((await query`SELECT first_name FROM contacts WHERE id=${a.contact}`)[0].first_name, "ALPHA_ONLY");
  assert.equal(Number((await query`SELECT count(*) FROM companies`)[0].count), 2);
  assert.equal(Number((await query`SELECT count(*) FROM contacts`)[0].count), 2);
  passed("forged cross-workspace reads, edits, deletes, associations and email sends rejected");
  assert.equal((await request("/api/cron/sync")).status, 401);
  assert.equal((await request("/api/webhooks/apxledger", "", { method: "POST", body: "null" })).status, 400);
  assert.equal((await request("/api/webhooks/apxledger", "", { method: "POST", body: JSON.stringify({ companyId: "unknown" }) })).status, 401);
  passed("cron and webhook authentication reaches the route and rejects unauthenticated requests");
  const prospectMigration = readFileSync("migrations/20260921_prospects.sql", "utf8");
  // This connection targets only the disposable database created above. Verify
  // the production migration creates fresh tables, not only IF NOT EXISTS.
  await query.query("DROP TABLE prospects, prospect_imports");
  const prospectStatements = prospectMigration.split(";").map(s=>s.trim()).filter(Boolean);
  await query.transaction(prospectStatements.map(s=>query.query(s)));
  await query.transaction(prospectStatements.map(s=>query.query(s)));
  const book = new ExcelJS.Workbook();
  const prospectSheet = book.addWorksheet("Ranked Prospects");
  prospectSheet.addRow(["Company", "Fit", "Verdict", "Contact", "Contact title", "Why APX fits", "Custom evidence"]);
  prospectSheet.addRow(["PROSPECT_ALPHA", 5, "Hot", "Alex Founder", "CEO", "Growing team", "Retain this"]);
  prospectSheet.addRow(["EXCLUDED_ALPHA", 1, "Skip", "", "", "Not a fit", ""]);
  const blob = new Blob([await book.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  ok(await action("uploadProspects", a.cookie, { file: new File([blob], "prospects.xlsx"), mode: "preview" }, "/prospects"), "prospect preview");
  assert.equal(Number((await query`SELECT count(*) FROM prospects`)[0].count), 0);
  for(let i=0;i<2;i++) ok(await action("uploadProspects", a.cookie, { file: new File([blob], "prospects.xlsx"), mode: "import" }, "/prospects"), "prospect import");
  assert.equal(Number((await query`SELECT count(*) FROM prospects WHERE workspace_id=${a.workspace}`)[0].count), 2);
  assert.equal(Number((await query`SELECT count(*) FROM prospect_imports WHERE workspace_id=${a.workspace}`)[0].count), 1);
  assert.equal(Number((await query`SELECT count(*) FROM companies`)[0].count), 3, "eligible import automatically creates a company");
  const [prospect] = await query`SELECT * FROM prospects WHERE data->>'company'='PROSPECT_ALPHA' AND workspace_id=${a.workspace}`;
  assert.ok(prospect.company_id, "import links research to CRM automatically");
  assert.equal(prospect.raw["Custom evidence"], "Retain this");
  assert.ok(!(await request("/prospects", b.cookie)).text.includes("PROSPECT_ALPHA"));
  assert.equal((await request("/prospects/" + prospect.id, b.cookie)).status, 404);
  await action("updateProspect", b.cookie, { id:prospect.id, status:"qualified", fit:"2" }, "/prospects");
  assert.equal((await query`SELECT status FROM prospects WHERE id=${prospect.id}`)[0].status, "research");
  await action("linkProspect", b.cookie, { id:prospect.id }, "/prospects");
  assert.equal((await query`SELECT company_id FROM prospects WHERE id=${prospect.id}`)[0].company_id, prospect.company_id);
  ok(await action("updateProspect", a.cookie, { id:prospect.id, status:"ready", fit:"4", rationale:"Reviewed fit", nextAction:"Research email", nextActionDate:"2026-10-01" }, "/prospects"), "review prospect");
  assert.equal((await query`SELECT data->>'fit' AS fit FROM prospects WHERE id=${prospect.id}`)[0].fit, "4");
  assert.equal((await query`SELECT raw->>'Fit' AS fit FROM prospects WHERE id=${prospect.id}`)[0].fit, "5");
  for(let i=0;i<2;i++) await action("linkProspect", a.cookie, { id:prospect.id }, "/prospects");
  assert.equal(Number((await query`SELECT count(*) FROM companies WHERE name='PROSPECT_ALPHA'`)[0].count), 1);
  assert.equal(Number((await query`SELECT count(*) FROM contacts WHERE first_name='Alex Founder'`)[0].count), 1);
  for(let i=0;i<2;i++) ok(await action("createProspectTask", a.cookie, { id:prospect.id }, "/prospects"), "prospect follow-up task");
  assert.equal(Number((await query`SELECT count(*) FROM activities WHERE subject='Research email'`)[0].count), 1);
  const [excluded] = await query`SELECT id FROM prospects WHERE data->>'company'='EXCLUDED_ALPHA'`;
  await action("linkProspect", a.cookie, { id:excluded.id }, "/prospects");
  assert.equal(Number((await query`SELECT count(*) FROM companies WHERE name='EXCLUDED_ALPHA'`)[0].count), 0);
  passed("prospect preview, repeat import, raw preservation, review, promotion and workspace isolation");
  await query`INSERT INTO companies(workspace_id,name,domain,lifecycle_stage,revenue_ytd_cents) VALUES
    (${a.workspace},'SecondCo','https://www.second.test/about','customer',12345),
    (${a.workspace},'ConflictCo',NULL,'lead',0),(${a.workspace},'ConflictCo',NULL,'lead',0)`;
  let sourceRow = 100;
  for (const [name,domain,status] of [['SecondCo','second.test','research'],['SecondCo','second.test','research'],['Brand New','brandnew.test','research'],['Brand New','brandnew.test','research'],['ConflictCo',null,'research'],['Excluded new',null,'disqualified']]) {
    const data = {...prospect.data,company:name,domain,contact:'Taylor Person',financeLead:'CFO: Morgan Finance',flag:null,financeNotes:null};
    await query`INSERT INTO prospects(workspace_id,import_id,source_sheet,source_row,raw,data,status)
      VALUES(${a.workspace},${prospect.import_id},'Sync fixtures',${sourceRow++},${JSON.stringify({Company:name})}::jsonb,${JSON.stringify(data)}::jsonb,${status})`;
  }
  const beforeBulk=Number((await query`SELECT count(*) FROM companies`)[0].count);
  const preview=await action('syncQualifiedProspects',a.cookie,'preview','/prospects'); ok(preview,'bulk preview');
  assert.ok(preview.text.includes('Multiple CRM companies match'));
  assert.equal(Number((await query`SELECT count(*) FROM companies`)[0].count),beforeBulk);
  for(const result of await Promise.all([1,2].map(()=>action('syncQualifiedProspects',a.cookie,'sync','/prospects')))) {
    ok(result,'concurrent bulk sync'); assert.ok(result.text.includes('"ok":true'),result.text.slice(0,500));
  }
  assert.equal(Number((await query`SELECT count(*) FROM companies WHERE name='Brand New'`)[0].count),1);
  assert.equal(Number((await query`SELECT count(*) FROM contacts WHERE first_name='Taylor Person'`)[0].count),2);
  assert.equal(Number((await query`SELECT count(*) FROM contacts WHERE first_name='Morgan Finance'`)[0].count),2);
  assert.equal(Number((await query`SELECT revenue_ytd_cents FROM companies WHERE name='SecondCo'`)[0].revenue_ytd_cents),12345);
  assert.equal((await query`SELECT lifecycle_stage FROM companies WHERE name='SecondCo'`)[0].lifecycle_stage,'customer');
  assert.equal(Number((await query`SELECT count(*) FROM prospects WHERE source_sheet='Sync fixtures' AND company_id IS NOT NULL`)[0].count),4);
  const repeated=await action('syncQualifiedProspects',a.cookie,'sync','/prospects'); ok(repeated,'repeat bulk sync');
  assert.ok(repeated.text.includes('"companiesCreated":0')); assert.ok(repeated.text.includes('"contactsCreated":0'));
  ok(await action('syncQualifiedProspects',b.cookie,'sync','/prospects'),'other workspace bulk sync');
  assert.equal(Number((await query`SELECT count(*) FROM companies WHERE workspace_id=${b.workspace}`)[0].count),1);
  passed('bulk sync previews, normalizes websites, creates finance contacts, holds conflicts, preserves customers and serializes concurrent retries');
  console.log("ALL WORKSPACE CHECKS PASSED. No email was sent.");
  if (process.env.PROSPECT_PREVIEW === "1") {
    console.log("Disposable UI preview: " + origin + "/prospects — tenantalpha@example.test / " + a.password);
    console.log("Preview stays available for three minutes, then its database is removed.");
    await new Promise(resolve=>setTimeout(resolve,180000));
  }
} catch (error) {
  console.error(logs.slice(-5000));
  throw error;
} finally {
  if (server && server.exitCode === null) { server.kill(); await new Promise((resolve) => server.once("exit", resolve)); }
  if (created) {
    // Only the exact disposable database created above can be removed.
    assert.match(database, /^apxreach_qa_[a-f0-9]{32}$/);
    await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    console.log("Removed isolated test database " + database + "; live data was untouched.");
  }
}
