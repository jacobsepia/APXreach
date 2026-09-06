/*
 * The one question every cron route asks. Vercel sends the secret as a
 * bearer token on each invocation; nothing else may run a route that walks
 * every workspace and talks to outside services.
 *
 * No secret configured is a refusal, not a pass. The other choice fails in
 * exactly the environment where it matters, and silently — the job would
 * still work, it would just also work for anyone.
 */
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}
