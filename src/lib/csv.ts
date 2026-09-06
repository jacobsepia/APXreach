/*
 * Reading a contacts spreadsheet somebody exported from wherever they kept
 * it before. Two parts: a CSV reader that survives quoted commas and line
 * breaks inside cells, and a column guesser that turns "E-mail Address",
 * "Company Name" and "Full Name" into the fields a contact has.
 *
 * Pure functions, so the browser can preview what will happen before a byte
 * is sent, and the server can check the same thing before a row is written.
 */

/** RFC 4180, plus the tolerance real exports need: CRLF or LF, a BOM, a stray trailing newline. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === ",") { row.push(cell); cell = ""; continue; }
    if (char === "\r") continue;
    if (char === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    cell += char;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  /* A blank line is not a contact. */
  return rows.filter((cells) => cells.some((value) => value.trim() !== ""));
}

export type ContactImportRow = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
};

export type ContactColumnKey = "firstName" | "lastName" | "fullName" | "email" | "phone" | "company" | "title";

const columnGuesses: Array<[ContactColumnKey, RegExp]> = [
  ["firstName", /^(first[\s_-]*name|first|given[\s_-]*name|prénom|prenom)$/i],
  ["lastName", /^(last[\s_-]*name|last|surname|family[\s_-]*name|nom)$/i],
  ["fullName", /^(full[\s_-]*name|name|contact|contact[\s_-]*name|person)$/i],
  ["email", /^(e-?mail|e-?mail[\s_-]*address|email[\s_-]*1|primary[\s_-]*email|courriel)$/i],
  ["phone", /^(phone|telephone|tel|mobile|cell|phone[\s_-]*number|mobile[\s_-]*phone|business[\s_-]*phone|téléphone)$/i],
  ["company", /^(company|company[\s_-]*name|organi[sz]ation|organi[sz]ation[\s_-]*name|account|account[\s_-]*name|business|employer|entreprise)$/i],
  ["title", /^(title|job[\s_-]*title|position|role)$/i],
];

/** Which header means what. A header nothing matches is reported, not guessed. */
export function guessContactColumns(headers: string[]): { mapping: Partial<Record<ContactColumnKey, number>>; unmapped: string[] } {
  const mapping: Partial<Record<ContactColumnKey, number>> = {};
  const unmapped: string[] = [];
  headers.forEach((raw, index) => {
    const header = raw.trim();
    const hit = columnGuesses.find(([key, pattern]) => mapping[key] === undefined && pattern.test(header));
    if (hit) mapping[hit[0]] = index;
    else if (header) unmapped.push(header);
  });
  return { mapping, unmapped };
}

const clean = (value: string | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
const orNull = (value: string) => (value ? value : null);

/**
 * Rows to contacts. A "Full name" column splits at the first space. A row
 * with no name at all is dropped — there is nothing to call the person —
 * unless it has an email, in which case the address stands in for the name.
 */
export function rowsToContacts(rows: string[][], mapping: Partial<Record<ContactColumnKey, number>>): ContactImportRow[] {
  const at = (row: string[], key: ContactColumnKey) => (mapping[key] === undefined ? "" : clean(row[mapping[key]!]));
  const contacts: ContactImportRow[] = [];
  for (const row of rows) {
    let firstName = at(row, "firstName");
    let lastName = at(row, "lastName");
    const fullName = at(row, "fullName");
    if (!firstName && !lastName && fullName) {
      const [first, ...rest] = fullName.split(" ");
      firstName = first;
      lastName = rest.join(" ");
    }
    const email = at(row, "email").toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    if (!firstName && !lastName) {
      if (!email) continue;
      firstName = email;
    }
    contacts.push({
      firstName: firstName || "—",
      lastName: lastName || "—",
      email: orNull(email),
      phone: orNull(at(row, "phone")),
      company: orNull(at(row, "company")),
      title: orNull(at(row, "title")),
    });
  }
  return contacts;
}
