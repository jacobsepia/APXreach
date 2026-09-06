import assert from "node:assert/strict";
import { test } from "node:test";
import { guessContactColumns, parseCsv, rowsToContacts } from "../src/lib/csv";

test("quoted commas, embedded quotes, CRLF and a BOM all parse", () => {
  const text = '﻿Name,Email,Company\r\n"Sepia, Joseph",joseph@example.com,"NexCFO ""Inc"""\r\nAl,al@example.com,\r\n\r\n';
  assert.deepEqual(parseCsv(text), [
    ["Name", "Email", "Company"],
    ["Sepia, Joseph", "joseph@example.com", 'NexCFO "Inc"'],
    ["Al", "al@example.com", ""],
  ]);
  assert.deepEqual(parseCsv('a,"line\nbreak",c'), [["a", "line\nbreak", "c"]]);
});

test("headers from common exports are recognised, the rest reported", () => {
  const { mapping, unmapped } = guessContactColumns(["First Name", "Last Name", "E-mail Address", "Mobile Phone", "Company Name", "Job Title", "Birthday"]);
  assert.deepEqual(mapping, { firstName: 0, lastName: 1, email: 2, phone: 3, company: 4, title: 5 });
  assert.deepEqual(unmapped, ["Birthday"]);
  assert.deepEqual(guessContactColumns(["name", "email"]).mapping, { fullName: 0, email: 1 });
});

test("rows become contacts: full names split, bad emails drop the row, no name means the address stands in", () => {
  const rows = rowsToContacts(
    [["Joseph Sepia", "Joseph@Example.com", "NexCFO"], ["", "nobody@example.com", ""], ["Bad", "not-an-email", ""], ["", "", "Ghost Ltd"], ["Solo", "", ""]],
    { fullName: 0, email: 1, company: 2 },
  );
  assert.deepEqual(rows, [
    { firstName: "Joseph", lastName: "Sepia", email: "joseph@example.com", phone: null, company: "NexCFO", title: null },
    { firstName: "nobody@example.com", lastName: "—", email: "nobody@example.com", phone: null, company: null, title: null },
    { firstName: "Solo", lastName: "—", email: null, phone: null, company: null, title: null },
  ]);
});
