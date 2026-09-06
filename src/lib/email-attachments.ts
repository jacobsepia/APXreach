/*
 * What can ride along with an email, decided once and shared by the composer
 * (so the person hears "no" before the upload) and the send action (so a
 * hand-built request hears the same "no").
 *
 * Three megabytes, not more, because the smallest limit among the three
 * providers wins: Outlook's sendMail takes about 3 MB of attachment bytes in
 * one request, and Vercel caps a request body at 4.5 MB. Invoices, quotes and
 * PDFs fit with room to spare; a photo set or a video does not and never will
 * through this path.
 */

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

/** What is kept on the record: enough to say what was sent, never the bytes. */
export type AttachmentMeta = { name: string; size: number; type: string };

/** Program files, which every mail provider bounces anyway; better refused here with a reason. */
const BLOCKED_EXTENSIONS = new Set([
  "exe", "bat", "cmd", "com", "msi", "scr", "vbs", "vbe", "js", "jse", "ps1", "jar", "dll", "pif", "hta", "reg", "lnk", "cpl",
]);

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/** The first reason these files cannot be attached, or null when they can. */
export function attachmentProblem(files: ReadonlyArray<{ name: string; size: number }>): string | null {
  if (files.length > MAX_ATTACHMENTS) return `Attach up to ${MAX_ATTACHMENTS} files per email.`;
  let total = 0;
  for (const file of files) {
    const name = file.name.trim();
    if (!name) return "One of the files has no name.";
    if (name.length > 200) return `"${name.slice(0, 40)}…" has a name longer than 200 characters.`;
    if (BLOCKED_EXTENSIONS.has(extensionOf(name))) return `"${name}" is a program file, which mail providers block.`;
    if (file.size <= 0) return `"${name}" is empty.`;
    total += file.size;
  }
  if (total > MAX_ATTACHMENT_BYTES) {
    return `These files total ${formatBytes(total)}; the limit is ${formatBytes(MAX_ATTACHMENT_BYTES)} per email.`;
  }
  return null;
}
