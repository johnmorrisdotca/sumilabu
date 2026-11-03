import { NextResponse, type NextRequest } from "next/server";

import { decide, isTokenApi } from "@/lib/auth/gate";
import { adminFromCookies } from "@/lib/auth/session";

/**
 * The gate (SUMILABU-7): every page needs John's Google sign-in, on every
 * host; the decision is `lib/auth/gate.ts`. (The other host names send pages
 * to app.sumilabu.com before this runs: `redirects()` in next.config.ts.) It runs before any page, so a
 * signed-out visit or a bot's is answered with a redirect and never reaches a
 * render or a database read: it costs one cookie decryption and nothing else.
 *
 * The matcher leaves out the token API (`/api/…` except next-auth's
 * `/api/auth/…`) and Next's static files, so a device's heartbeat or an
 * agent's `pnpm task` pays for no extra step. `decide` makes the same
 * exception itself, so a matcher change cannot close the API by accident.
 *
 * `proxy.ts`, not `middleware.ts`: Next 16 renamed it. It runs on Node.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  if (isTokenApi(pathname)) return NextResponse.next();

  const decision = decide({ pathname, search, admin: (await adminFromCookies(request.cookies)) !== null });
  if (decision.kind === "pass") return NextResponse.next();
  const response = NextResponse.redirect(new URL(decision.location, request.url), 307);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: ["/((?!api/(?!auth/)|_next/static|_next/image|favicon.ico|sumilabu.png|robots.txt).*)"],
};
