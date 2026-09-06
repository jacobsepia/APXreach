export const templateTags = {
  first_name: "First name", last_name: "Last name", company_name: "Customer company",
  sender_name: "Your name", sender_company: "Your company", milestone: "Milestone to celebrate",
  follow_up_topic: "Conversation topic", next_step: "Suggested next step",
  invoice_number: "Invoice number", invoice_balance: "Remaining invoice balance", invoice_due_date: "Invoice due date",
} as const;
export type TemplateTag = keyof typeof templateTags;
export type EmailTemplate = { key: string; name: string; subject: string; bodyHtml: string; invoiceMode: "none" | "open" | "overdue"; revision: string | null };
export function escapeHtml(text: string) { return text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!); }
function paragraphs(text: string) { return text.split("\n\n").map(p => `<p>${escapeHtml(p).replaceAll("\n", "<br>")}</p>`).join(""); }
function starter(key: string, name: string, subject: string, body: string, invoiceMode: EmailTemplate["invoiceMode"] = "none"): EmailTemplate {
  return { key, name, subject, bodyHtml: paragraphs(`Hi {{first_name}},\n\n${body}\n\nBest,\n{{sender_name}}`), invoiceMode, revision: null };
}
export const starterTemplates: EmailTemplate[] = [
  starter("checking-in", "Just checking in", "A quick hello", "How are things at {{company_name}}? I wanted to check in and see whether there’s anything you need from us.\n\nIf something’s come up—or there’s anything we could be doing better—just reply here."),
  starter("congratulations", "Congratulations", "Congratulations, {{first_name}}!", "Congratulations on {{milestone}}! That’s lovely news, and I wanted to send you a personal note.\n\nWishing you and everyone at {{company_name}} all the best for what comes next."),
  starter("welcome", "Welcome aboard", "Welcome to {{sender_company}}", "It’s a pleasure to have {{company_name}} on board. I’m looking forward to working with you.\n\nIf there’s anything you’d like us to know from the outset, or a question you haven’t had a chance to ask, send it my way. I’m happy to help you get settled in."),
  starter("thank-you", "Thank you", "A note of thanks", "I wanted to say thank you for choosing to work with us. We appreciate your business and the trust you’ve placed in our team.\n\nIf there’s anything we can do to make working together easier, I’d like to hear it."),
  starter("following-up", "Following up", "Following up on {{follow_up_topic}}", "I wanted to pick up our conversation about {{follow_up_topic}}.\n\nWould {{next_step}} work for you? If your plans have changed or you need more time, just let me know."),
  starter("reconnect", "It’s been a while", "How have you been?", "It’s been a little while since we caught up. How are you, and how are things going at {{company_name}}?\n\nIf there’s something you’re working through that we could help with, I’d be glad to hear about it. Either way, it would be nice to catch up."),
  starter("feedback", "How are we doing?", "How has your experience been?", "I’d like to know how things have been going for you with {{sender_company}}. What’s working well, and is there anything you’d change?\n\nNo survey to fill out—a quick reply is plenty. Honest feedback helps us make the right improvements."),
  starter("invoice-due", "Invoice coming due", "Invoice {{invoice_number}} — due {{invoice_due_date}}", "A quick reminder that invoice {{invoice_number}} for {{company_name}} has a remaining balance of {{invoice_balance}}, due on {{invoice_due_date}}.\n\nIf you need another copy or have a question before arranging payment, let me know. If payment is already on its way, thank you.", "open"),
  starter("invoice-overdue", "Friendly overdue reminder", "Following up on invoice {{invoice_number}}", "Our latest records show a remaining balance of {{invoice_balance}} on invoice {{invoice_number}}, which was due {{invoice_due_date}}.\n\nCould you let me know when we can expect payment? If you’ve already paid, thanks—please send over the payment date so we can check our records.\n\nIf there’s a question about the invoice, I’m happy to help.", "overdue"),
  starter("payment-follow-up", "Payment follow-up", "Payment date for invoice {{invoice_number}}", "I’m following up on invoice {{invoice_number}}. Our latest records still show {{invoice_balance}} outstanding against the {{invoice_due_date}} due date.\n\nPlease reply with the date you expect to make payment. If something is holding it up, let me know so we can discuss the next step.\n\nIf payment has already been made, please send the date and reference so we can check it.", "overdue"),
];

export function tagsIn(text: string): string[] {
  return [...new Set(Array.from(text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g), match => match[1].trim()))];
}
export function hasUnresolvedTags(text: string) { return /\{\{|\}\}/.test(text); }
export function renderEmailTemplate(template: Pick<EmailTemplate, "subject" | "bodyHtml">, values: Record<string, string>) {
  const missing = tagsIn(template.subject + template.bodyHtml).filter(tag => !Object.hasOwn(templateTags, tag) || !values[tag]?.trim());
  const replace = (source: string, html: boolean) => source.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (token, key: string) => {
    const value = values[key.trim()];
    return value?.trim() ? (html ? escapeHtml(value.trim()) : value.trim()) : token;
  });
  return { subject: replace(template.subject, false), bodyHtml: replace(template.bodyHtml, true), missing };
}
