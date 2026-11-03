import { getToken } from "next-auth/jwt";

import { isAdminEmail } from "./admins";
import { authSecret } from "./options";

type Env = Record<string, string | undefined>;

/** What both `cookies()` from next/headers and a NextRequest's `cookies` offer. */
export type CookieJar = { getAll(): Array<{ name: string; value: string }> };

export type Admin = { email: string; name: string | null };

/**
 * The same choice next-auth makes when it sets the cookie: the `__Secure-`
 * name whenever the site's address is https (NEXTAUTH_URL, or Vercel's own
 * https when it is unset), the plain name on a local http dev server.
 */
export function secureCookie(env: Env = process.env): boolean {
  return env.NEXTAUTH_URL ? env.NEXTAUTH_URL.startsWith("https://") : Boolean(env.VERCEL);
}

/**
 * The signed-in admin, or null. One function for the gate (`proxy.ts`) and the
 * pages, so the two can never disagree about who is in.
 *
 * Reads the next-auth session cookie only, decrypted with AUTH_SECRET: no
 * database, no network, so it is safe to run before anything else on every
 * request. An expired, forged or foreign cookie decrypts to nothing. The
 * address is checked against SUMILABU_ADMIN_EMAILS again here, not only at the
 * sign-in, so taking an address off the list closes the door at the next
 * deploy rather than when the cookie lapses. No secret means nobody.
 *
 * Deliberately never a Bearer header (which `getToken` would otherwise
 * accept): pages are for a browser with a cookie, and the API's tokens are a
 * different thing that must not be confused with this.
 */
export async function adminFromCookies(jar: CookieJar, env: Env = process.env): Promise<Admin | null> {
  const secret = authSecret(env);
  if (!secret) return null;
  const token = await getToken({
    req: { cookies: jar, headers: new Headers() } as unknown as Parameters<typeof getToken>[0]["req"],
    secret,
    secureCookie: secureCookie(env),
  });
  if (!token || !isAdminEmail(token.email, env)) return null;
  return { email: String(token.email), name: typeof token.name === "string" ? token.name : null };
}
