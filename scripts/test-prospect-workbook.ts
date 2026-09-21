import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { mapProspect, domainOf } from "../src/lib/prospect-data";
import { readProspectWorkbook } from "../src/lib/prospect-workbook";

async function main() {
  assert.equal(domainOf("https://www.Example.ca/about"), "example.ca");
  assert.equal(domainOf("javascript:alert(1)"), null);
  assert.equal(domainOf("—"), null);
  const duplicate = mapProspect(
    {
      Company: "Example",
      Fit: "",
      Verdict: "Skipped",
      Flag: "Duplicate: company already ranked",
    },
    "Skipped",
    2,
  );
  assert.equal(duplicate.status, "duplicate");
  assert.equal(duplicate.data.fit, null);
  assert.equal(
    mapProspect(
      { Company: "Example", Fit: "1", Verdict: "Skip" },
      "Ranked Prospects",
      3,
    ).status,
    "disqualified",
  );
  assert.equal(
    mapProspect(
      {
        Company: "Example",
        Fit: "5",
        Verdict: "Hot",
        "Finance lead": "None found",
      },
      "Ranked Prospects",
      2,
    ).data.financeLead,
    "None found",
  );
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Prospects");
  sheet.addRow(["Company", "Fit", "Unknown future column"]);
  sheet.addRow(["Example", 5, "preserve me"]);
  const rows = await readProspectWorkbook(
    Buffer.from(await book.xlsx.writeBuffer()),
  );
  assert.equal(rows[0].raw["Unknown future column"], "preserve me");
  assert.equal(rows[0].status, "research");
  sheet.getCell("C1").value = "Company";
  const bookBuffer = await book.xlsx.writeBuffer();
  await assert.rejects(
    () => readProspectWorkbook(Buffer.from(bookBuffer)),
    /duplicate headers/,
  );
}

async function run() {
  await main();
  if (process.argv[2]) {
    const rows = await readProspectWorkbook(await readFile(process.argv[2]));
    assert.equal(rows.length, 656);
    assert.equal(
      rows.filter((r) => r.sheet === "Ranked Prospects").length,
      430,
    );
    assert.equal(rows.filter((r) => r.sheet === "Microbusinesses").length, 179);
    assert.equal(rows.filter((r) => r.sheet === "Skipped").length, 47);
    assert.equal(rows.filter((r) => r.data.fit === 5).length, 151);
    assert.equal(
      rows.filter(
        (r) => r.sheet === "Ranked Prospects" && r.status === "disqualified",
      ).length,
      22,
    );
    assert.ok(rows[0].raw["Finance notes"].length > 0);
    console.log(
      "PASS actual APX workbook: all 656 rows and 3 sheets reconciled",
    );
  }
  console.log(
    "PASS prospect normalization, dispositions, unknown fields and invalid headers",
  );
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
