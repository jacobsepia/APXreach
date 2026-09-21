export type ProspectData = {
  company: string;
  domain: string | null;
  location: string | null;
  industry: string | null;
  employees: string | null;
  contact: string | null;
  contactTitle: string | null;
  linkedin: string | null;
  description: string | null;
  signals: string | null;
  rationale: string | null;
  flag: string | null;
  financeLead: string | null;
  financeSource: string | null;
  financeNotes: string | null;
  serviceLane: string | null;
  source: string | null;
  lists: string[];
  fit: number | null;
  verdict: string | null;
  originalRank: string | null;
};
export type ProspectRow = {
  sheet: string;
  row: number;
  raw: Record<string, string>;
  data: ProspectData;
  status: string;
};
export const prospectStatuses = [
  "research",
  "ready",
  "contacted",
  "nurture",
  "qualified",
  "disqualified",
  "duplicate",
] as const;
export function clean(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return !text || /^(?:—|-|n\/a|\(none\)|\(no company listed\))$/i.test(text)
    ? null
    : text;
}
export function domainOf(value: unknown): string | null {
  const text = clean(value);
  if (!text) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return /^https?:$/.test(url.protocol) && url.hostname.includes(".")
      ? url.hostname.toLowerCase().replace(/^www\./, "")
      : null;
  } catch {
    return null;
  }
}
export function mapProspect(
  raw: Record<string, string>,
  sheet: string,
  row: number,
): ProspectRow {
  const get = (key: string) => clean(raw[key]);
  const score = Number(get("Fit"));
  const data: ProspectData = {
    company: get("Company") ?? get("Contact") ?? "Unidentified record",
    domain: domainOf(get("Website")),
    location: get("Location"),
    industry: get("Industry"),
    employees: get("Est. employees"),
    contact: get("Contact"),
    contactTitle: get("Contact title"),
    linkedin: get("LinkedIn"),
    description: get("What they do"),
    signals: get("Signals"),
    rationale: get("Why APX fits"),
    flag: get("Flag"),
    financeLead: get("Finance lead"),
    financeSource: get("Lead source"),
    financeNotes: get("Finance notes"),
    serviceLane: get("Service lane"),
    source: get("Source") ?? get("Source list"),
    lists: (get("List(s)") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    fit: Number.isInteger(score) && score >= 1 && score <= 5 ? score : null,
    verdict: get("Verdict"),
    originalRank: get("Rank"),
  };
  const excluded =
    /skip/i.test(data.verdict ?? "") || sheet.toLowerCase() === "skipped";
  const duplicate =
    excluded && /duplicate|already ranked/i.test(data.flag ?? "");
  return {
    sheet,
    row,
    raw,
    data,
    status: duplicate ? "duplicate" : excluded ? "disqualified" : "research",
  };
}
