// End-to-end checks against a disposable database, NEVER against live records.
// Run after npm run build: node --env-file=.env.local scripts/test-workspaces.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { neon } from "@neondatabase/serverless";
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
const references = new Map(Object.entries(manifest).map(([id, entry]) => [Object.values(entry.workers)[0].exportedName, id]));

async function request(path, cookie = "", init = {}) {
  const response = await fetch(origin + path, { redirect: "manual", ...init,
    headers: { cookie, origin, ...init.headers }, signal: AbortSignal.timeout(45000) });
  return { status: response.status, text: await response.text(), headers: response.headers };
}
async function signup(name) {
  const result = await request("/api/auth/sign-up/email", "", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, email: name.toLowerCase() + "@example.test", password: "Test-only-" + randomUUID() }) });
  assert.equal(result.status, 200, "Public signup: " + result.text);
  const cookie = result.headers.getSetCookie().map((v) => v.split(";")[0]).join("; ");
  assert.ok(cookie.includes("session_token"));
  return { id: JSON.parse(result.text).user.id, cookie };
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
  console.log("ALL WORKSPACE CHECKS PASSED. No email was sent.");
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
