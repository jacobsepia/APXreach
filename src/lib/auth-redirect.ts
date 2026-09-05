/** Only same-site paths can be destinations after signing in. */
export function safeAuthDestination(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) return "/dashboard";
  const base = "https://reach.invalid";
  const destination = new URL(value, base);
  return destination.origin === base ? destination.pathname + destination.search + destination.hash : "/dashboard";
}
