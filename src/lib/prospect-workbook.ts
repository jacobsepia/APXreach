import ExcelJS from "exceljs";
import { mapProspect, type ProspectRow } from "./prospect-data";

export async function readProspectWorkbook(
  bytes: Buffer,
): Promise<ProspectRow[]> {
  if (bytes.length > 3 * 1024 * 1024)
    throw new Error("Use a workbook smaller than 3 MB.");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    bytes as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  const result: ProspectRow[] = [];
  for (const sheet of workbook.worksheets) {
    if (!sheet.rowCount) continue;
    if (sheet.rowCount > 2001 || sheet.columnCount > 100)
      throw new Error(
        "Each sheet must have at most 2,000 rows and 100 columns.",
      );
    const headers: string[] = [];
    sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
      headers[column - 1] = cell.text.trim();
    });
    if (!headers.includes("Company") || !headers.includes("Fit"))
      throw new Error(
        `Sheet “${sheet.name}” needs Company and Fit headers in row 1.`,
      );
    if (
      new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length
    )
      throw new Error(`Sheet “${sheet.name}” contains duplicate headers.`);
    sheet.eachRow((row, number) => {
      if (number === 1) return;
      row.eachCell((cell, column) => {
        if (cell.text.trim() && !headers[column - 1])
          throw new Error(
            `Sheet “${sheet.name}” has data without a header in column ${column}. Add a header before importing.`,
          );
      });
      const raw: Record<string, string> = Object.fromEntries(
        headers.flatMap((header, i) =>
          header ? [[header, row.getCell(i + 1).text]] : [],
        ),
      );
      if (Object.values(raw).some((value) => value.trim()))
        result.push(mapProspect(raw, sheet.name, number));
    });
  }
  if (!result.length || result.length > 2000)
    throw new Error("Import between 1 and 2,000 prospect rows at a time.");
  return result;
}
