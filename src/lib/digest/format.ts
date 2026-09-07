/*
 * The morning email, as text and HTML from one set of sections. Kept pure so
 * the wording can be tested without a mailbox. A digest with nothing in it
 * is not sent — a quiet morning is a quiet inbox.
 */

export type DigestItem = { text: string; href?: string; note?: string };
export type DigestSection = { title: string; items: DigestItem[]; more?: number };

export type DigestInput = {
  workspaceName: string;
  personName: string;
  date: Date;
  appUrl: string;
  sections: DigestSection[];
};

export function digestIsEmpty(sections: DigestSection[]): boolean {
  return sections.every((section) => section.items.length === 0);
}

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

export function renderDigest(input: DigestInput): { subject: string; text: string; html: string } {
  const day = new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "long", day: "numeric" }).format(input.date);
  const live = input.sections.filter((section) => section.items.length > 0);
  const counts = live.map((section) => `${section.items.length + (section.more ?? 0)} ${section.title.toLowerCase()}`).join(", ");
  const subject = `${input.workspaceName} today: ${counts}`;
  const first = input.personName.split(/\s+/)[0] || "there";

  const textLines: string[] = [`Good morning, ${first}. Here is ${input.workspaceName} for ${day}.`, ""];
  const htmlParts: string[] = [`<p>Good morning, ${escape(first)}. Here is <strong>${escape(input.workspaceName)}</strong> for ${escape(day)}.</p>`];
  for (const section of live) {
    textLines.push(section.title.toUpperCase());
    for (const item of section.items) {
      textLines.push(`- ${item.text}${item.note ? ` (${item.note})` : ""}${item.href ? `  ${input.appUrl}${item.href}` : ""}`);
    }
    if (section.more) textLines.push(`  …and ${section.more} more`);
    textLines.push("");
    htmlParts.push(`<h3 style="margin:18px 0 6px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#6f7885">${escape(section.title)}</h3>`);
    htmlParts.push("<ul style=\"margin:0;padding-left:18px\">");
    for (const item of section.items) {
      const label = item.href ? `<a href="${input.appUrl}${escape(item.href)}" style="color:#6b21a8">${escape(item.text)}</a>` : escape(item.text);
      htmlParts.push(`<li style="margin:3px 0">${label}${item.note ? ` <span style="color:#6f7885">— ${escape(item.note)}</span>` : ""}</li>`);
    }
    if (section.more) htmlParts.push(`<li style="margin:3px 0;color:#6f7885">…and ${section.more} more</li>`);
    htmlParts.push("</ul>");
  }
  textLines.push(`Open Reach: ${input.appUrl}/dashboard`, "", "Sent by APX Reach from your own mailbox. Turn it off in Settings.");
  htmlParts.push(`<p style="margin-top:20px"><a href="${input.appUrl}/dashboard" style="color:#6b21a8">Open Reach</a></p>`);
  htmlParts.push(`<p style="font-size:12px;color:#9aa1ab">Sent by APX Reach from your own mailbox. Turn it off in <a href="${input.appUrl}/settings" style="color:#9aa1ab">Settings</a>.</p>`);

  return {
    subject,
    text: textLines.join("\n"),
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#302b36">${htmlParts.join("")}</div>`,
  };
}
