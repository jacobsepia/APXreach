import assert from "node:assert/strict";
import { test } from "node:test";
import { hasUnresolvedTags, renderEmailTemplate, starterTemplates, tagsIn, templateTags } from "../src/lib/email-templates";
import { prepareEmailBody, sanitizeEmailHtml } from "../src/lib/email-content";

test("all ten starters use supported tags and resolve into sendable emails", () => {
  assert.equal(starterTemplates.length, 10);
  assert.equal(new Set(starterTemplates.map(item => item.key)).size, 10);
  const values = Object.fromEntries(Object.keys(templateTags).map(tag => [tag, "Example " + tag]));
  for (const template of starterTemplates) {
    assert.ok(tagsIn(template.subject + template.bodyHtml).every(tag => Object.hasOwn(templateTags, tag)));
    const result = renderEmailTemplate(template, values);
    assert.deepEqual(result.missing, []);
    assert.equal(hasUnresolvedTags(result.subject + result.bodyHtml), false);
    assert.ok(prepareEmailBody("", result.bodyHtml).text.length > 100);
  }
});
test("personalization escapes HTML and does not mutate the template", () => {
  const template = starterTemplates[0];
  const before = JSON.stringify(template);
  const result = renderEmailTemplate(template, { first_name: '<img src=x onerror=alert(1)>', company_name: 'A & B', sender_name: 'José' });
  assert.match(result.bodyHtml, /&lt;img/);
  assert.match(result.bodyHtml, /A &amp; B/);
  assert.equal(result.bodyHtml.replaceAll("<br>", "<br />"), sanitizeEmailHtml(result.bodyHtml));
  assert.equal(JSON.stringify(template), before);
});
test("missing and unknown details remain visible rather than being invented", () => {
  const result = renderEmailTemplate(starterTemplates[1], { first_name: "Joseph", company_name: "NexCFO", sender_name: "Jacob" });
  assert.deepEqual(result.missing, ["milestone"]);
  assert.ok(result.bodyHtml.includes("{{milestone}}"));
  assert.equal(hasUnresolvedTags(result.bodyHtml), true);
  assert.equal(hasUnresolvedTags("Hi {{first_name"), true);
  assert.deepEqual(renderEmailTemplate({ subject: "{{unknown}}", bodyHtml: "<p>Hello</p>" }, {}).missing, ["unknown"]);
});
