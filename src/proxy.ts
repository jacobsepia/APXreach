import { NextResponse, type NextRequest } from "next/server";

/*
 * The door. Anything that isn't the sign-in flow or the auth API needs a
 * session cookie to pass; the (app) layout then validates the session properly
 * server-side. This is the fast, edge-cheap check — presence, not proof.
 *
 * Named `proxy` rather than `middleware`: Next 16 deprecated that convention
 * (same as Ledger's src/proxy.ts).
 */

const PUBLIC_PREFIXES = ["/sign-in", "/sign-up", "/api/auth", "/_next", "/favicon"];

function hasSessionCookie(request: NextRequest): boolean {
  return Boolean(
    request.cookies.get("better-auth.session_token") ??
      request.cookies.get("__Secure-better-auth.session_token"),
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  if (hasSessionCookie(request)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/sign-in";
  /* Where they were headed — a path only, never a full URL, so this can't be
     bent into an open redirect. */
  const to = `${pathname}${request.nextUrl.search}`;
  url.search = "";
  if (to !== "/" && to.startsWith("/") && !to.startsWith("//")) {
    url.searchParams.set("to", to);
  }
  return NextResponse.redirect(url);
}
