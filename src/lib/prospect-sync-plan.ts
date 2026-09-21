import { randomUUID } from "node:crypto";
import { clean, domainOf, type ProspectData } from "./prospect-data";

export type SyncProspect = {
  id: string;
  raw: Record<string, string>;
  data: ProspectData;
  status: string;
  companyId: string | null;
};
export type SyncCompany = { id: string; name: string; domain: string | null };
export type SyncContact = {
  id: string;
  companyId: string | null;
  firstName: string;
  lastName: string;
};
export type SyncSnapshot = {
  prospects: SyncProspect[];
  companies: SyncCompany[];
  contacts: SyncContact[];
};
export type SyncSummary = {
  companiesCreated: number;
  contactsCreated: number;
  recordsLinked: number;
  alreadyLinked: number;
  excluded: number;
  held: { id: string; company: string; reason: string }[];
};
const key = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const placeholder =
  /^(?:none(?: found)?|unknown|not (?:found|available|listed|recorded)|n\/a|—|-|\(none\)|\(no company listed\)|unidentified record)$/i;
function companyDomain(value: string | null) {
  const domain = domainOf(value);
  return domain &&
    !/^(?:www\.)?(?:linkedin\.com|facebook\.com|instagram\.com|linktr\.ee|twitter\.com|x\.com)$/.test(
      domain,
    )
    ? domain
    : null;
}
function humanName(value: string | null): string | null {
  const name = clean(value);
  const roleOnly =
    /^(?:(?:chief|executive|officer|finance|financial|director|controller|accountant|bookkeeper|president|ceo|cfo|vp|founder|owner|manager|head|of|accounting|department|team|contact|person|lead|managing|and|co-founder)\s*)+$/i;
  if (
    !name ||
    placeholder.test(name) ||
    roleOnly.test(name) ||
    /not publicly|not available|unknown|redacted|not found|not confirmed|\.{3}|…|https?:|@|;|\s(?:and|&)\s|\//i.test(
      name,
    )
  )
    return null;
  // Keep credentials and compound surnames intact. Never manufacture a person
  // from a role, company or partial name.
  return /^[\p{L}][\p{L}\p{M}\s.,'’()\-]+$/u.test(name) &&
    name.split(/\s+/).length >= 2
    ? name
    : null;
}
export function prospectPeople(data: ProspectData) {
  const result: {
    firstName: string;
    lastName: string;
    title: string | null;
  }[] = [];
  const primary = humanName(data.contact);
  if (primary)
    result.push({ firstName: primary, lastName: "", title: data.contactTitle });
  const finance = data.financeLead?.match(/^([^:]+):\s*(.+)$/);
  if (finance) {
    const name = humanName(
      finance[2].replace(
        /\s*\((?:fractional|interim|most senior found)\)\s*$/i,
        "",
      ),
    );
    if (name && !result.some((p) => key(p.firstName) === key(name)))
      result.push({ firstName: name, lastName: "", title: finance[1].trim() });
  }
  return result;
}
export function buildProspectSyncPlan(snapshot: SyncSnapshot, onlyId?: string) {
  const companies: (SyncCompany & {
    city: string | null;
    industry: string | null;
    source: string | null;
  })[] = [];
  const contacts: (SyncContact & { title: string | null })[] = [];
  const links: { prospectId: string; companyId: string }[] = [];
  const summary: SyncSummary = {
    companiesCreated: 0,
    contactsCreated: 0,
    recordsLinked: 0,
    alreadyLinked: 0,
    excluded: 0,
    held: [],
  };
  const existing = [...snapshot.companies];
  const personKeys = new Set(
    snapshot.contacts.map(
      (c) =>
        `${c.companyId}:${key(`${c.firstName} ${c.lastName === "—" ? "" : c.lastName}`)}`,
    ),
  );
  const domainsByName = new Map<string, Set<string>>();
  for (const p of snapshot.prospects) {
    if (["disqualified", "duplicate"].includes(p.status)) continue;
    const domain = companyDomain(p.data.domain);
    if (domain) {
      const names = domainsByName.get(key(p.data.company)) ?? new Set<string>();
      names.add(domain);
      domainsByName.set(key(p.data.company), names);
    }
  }
  for (const p of snapshot.prospects) {
    if (onlyId && p.id !== onlyId) continue;
    if (["disqualified", "duplicate"].includes(p.status)) {
      summary.excluded++;
      continue;
    }
    const hold = (reason: string) =>
      summary.held.push({ id: p.id, company: p.data.company, reason });
    const name = clean(p.raw.Company);
    if (!name || placeholder.test(name)) {
      hold("No business name recorded");
      continue;
    }
    if (
      /identity (?:is )?(?:unclear|unconfirmed|ambiguous)|(?:unclear|ambiguous) company|wrong company|employee mismatch|no company listed/i.test(
        [p.data.flag, p.data.financeNotes].join(" "),
      )
    ) {
      hold("Company identity needs review");
      continue;
    }
    const domain = companyDomain(p.data.domain);
    if ((domainsByName.get(key(p.data.company))?.size ?? 0) > 1) {
      hold("Same company name has conflicting websites");
      continue;
    }
    const matches = p.companyId
      ? existing.filter((c) => c.id === p.companyId)
      : existing.filter(
          (c) =>
            key(c.name) === key(p.data.company) ||
            Boolean(domain && companyDomain(c.domain) === domain),
        );
    if (matches.length > 1) {
      hold(
        "Multiple CRM companies match; choose the correct company before syncing",
      );
      continue;
    }
    if (p.companyId && matches.length !== 1) {
      hold("Linked company is unavailable in this workspace");
      continue;
    }
    let company = matches[0];
    if (
      company &&
      domain &&
      companyDomain(company.domain) &&
      domain !== companyDomain(company.domain)
    ) {
      hold("Company name matches but websites disagree");
      continue;
    }
    if (!company) {
      company = { id: randomUUID(), name: p.data.company, domain };
      existing.push(company);
      companies.push({
        ...company,
        city: p.data.location,
        industry: p.data.industry,
        source: p.data.source,
      });
    }
    if (!p.companyId) links.push({ prospectId: p.id, companyId: company.id });
    else summary.alreadyLinked++;
    for (const person of prospectPeople(p.data)) {
      const personKey = `${company.id}:${key(person.firstName)}`;
      if (personKeys.has(personKey)) continue;
      personKeys.add(personKey);
      contacts.push({ id: randomUUID(), companyId: company.id, ...person });
    }
  }
  summary.companiesCreated = companies.length;
  summary.contactsCreated = contacts.length;
  summary.recordsLinked = links.length;
  return { companies, contacts, links, summary };
}
