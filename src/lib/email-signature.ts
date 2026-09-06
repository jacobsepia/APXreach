/** Sender details only—never the customer's company, phone, or email. */
export function emailSignature(name: string, company: string, email = "") {
  const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
  const lines = [name.trim(), company.trim(), email.trim()].filter(Boolean);
  const html = [name.trim() ? `<strong>${escape(name.trim())}</strong>` : "", company.trim() ? `<span style="font-size:12px">${escape(company.trim())}</span>` : "", email.trim() ? `<span style="font-size:12px">${escape(email.trim())}</span>` : ""].filter(Boolean).join("<br>");
  return { html, text: lines.join("\n") };
}

export function isSignatureOnly(body: string, signature: string) {
  const normalize = (value: string) => value.replace(/[\s\u200B-\u200D\uFEFF]+/g, " ").trim();
  return !normalize(body) || normalize(body) === normalize(signature);
}
