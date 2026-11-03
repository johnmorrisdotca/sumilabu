/**
 * The gate in front of every page (SUMILABU-7), as a pure decision so every
 * branch has a test; `src/proxy.ts` only gathers the facts and acts on this.
 *
 * Closed by default: a path is public only when it is on the short list
 * below, so a page added tomorrow is private without anybody remembering to
 * make it so (itsutsu's `proxy.ts` works the same way). The API is the one
 * family of paths the gate leaves alone, because every route under `/api/`
 * checks its own bearer token (or is one of the few deliberately public ones),
 * and `src/app/api/api-access.test.ts` fails when a route appears that is in
 * neither list. Which host a page is served on is next.config.ts's
 * `redirects()`, not this.
 */

/** Reachable signed out, exactly these paths. The sign-in pages, and the two files a browser asks for on its own. */
export const PUBLIC_PATHS: ReadonlySet<string> = new Set(["/signin", "/not-allowed", "/favicon.ico", "/sumilabu.png", "/robots.txt"]);

/** next-auth's own routes: the sign-in, its callback, the CSRF token and sign-out. A door nobody can reach is no door. */
export const AUTH_PREFIX = "/api/auth/";

export type GateInput = {
  pathname: string;
  search: string;
  /** Whether the request carries a valid session for an address on the list. */
  admin: boolean;
};

export type GateDecision = { kind: "pass" } | { kind: "redirect"; location: string };

/** A token-checked API route: not `/api/auth/…`, which is the sign-in itself and so a page in all but name. */
export function isTokenApi(pathname: string): boolean {
  return pathname.startsWith("/api/") && !pathname.startsWith(AUTH_PREFIX);
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname) || pathname.startsWith(AUTH_PREFIX);
}

/** Where a signed-out visitor is sent, carrying where they were going (a path on this site, never another host). */
export function signInLocation(pathname: string, search: string): string {
  const back = `${pathname}${search}`;
  return back === "/" ? "/signin" : `/signin?callbackUrl=${encodeURIComponent(back)}`;
}

export function decide(input: GateInput): GateDecision {
  /* Devices, release tools and agents: their tokens are checked by the route, on any host, exactly as before. */
  if (isTokenApi(input.pathname)) return { kind: "pass" };

  if (isPublicPath(input.pathname) || input.admin) return { kind: "pass" };
  return { kind: "redirect", location: signInLocation(input.pathname, input.search) };
}
