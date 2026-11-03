import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

import { isAdminEmail } from "./admins";

/**
 * Google sign-in for the site's pages (SUMILABU-7).
 *
 * Taken from umakuma's `src/lib/auth.ts` (next-auth 4, the JWT strategy, the
 * env names with their fallbacks, `prompt=select_account`, and refusing an
 * address Google has not verified), with itsutsu's rule from
 * `src/lib/auth/google.ts` that Google proves an address and this site decides
 * who comes in. Unlike either of them there is no user table and no second
 * cookie: the only people are the addresses in SUMILABU_ADMIN_EMAILS, so the
 * decision is made here, at the sign-in, and again by the gate (`gate.ts`) on
 * every page request. A stranger with a Google account is refused at the
 * callback and never gets a session cookie at all.
 */

type Env = Record<string, string | undefined>;

function firstEnv(names: string[], env: Env): string | null {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return null;
}

/** Below this the secret is treated as missing: nobody signs in, and the gate lets nobody through. */
export const MIN_SECRET_LENGTH = 32;
export const SESSION_DAYS = 30;

export function authSecret(env: Env = process.env): string | null {
  const secret = firstEnv(["AUTH_SECRET", "NEXTAUTH_SECRET"], env);
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

export function googleClient(env: Env = process.env): { clientId: string; clientSecret: string } | null {
  const clientId = firstEnv(["AUTH_GOOGLE_ID", "GOOGLE_CLIENT_ID"], env);
  const clientSecret = firstEnv(["AUTH_GOOGLE_SECRET", "GOOGLE_CLIENT_SECRET"], env);
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** False when a piece is missing, so the sign-in page can say so rather than offer a button that cannot work. */
export function isGoogleAuthConfigured(env: Env = process.env): boolean {
  return googleClient(env) !== null && authSecret(env) !== null;
}

/**
 * A stand-in for accounts.google.com, for the local end-to-end run only
 * (`scripts/auth-e2e/`). Read only when NODE_ENV is `development` or `test`
 * - named rather than "not production", so an unset or misspelled NODE_ENV
 * can never send a real deployment's sign-in somewhere else (itsutsu's
 * `isUnprotectedEnvironment` rule).
 */
export function testIssuer(env: Env = process.env): string | null {
  const where = env.NODE_ENV;
  if (where !== "development" && where !== "test") return null;
  const issuer = env.SUMILABU_GOOGLE_TEST_ISSUER?.trim();
  return issuer && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(issuer) ? issuer : null;
}

/** Google, and an address Google has verified, on the list. Anything else is no session. */
export function admits(provider: string | undefined, profile: unknown, env: Env = process.env): boolean {
  if (provider !== "google") return false;
  const claims = (profile ?? {}) as { email?: unknown; email_verified?: unknown };
  if (claims.email_verified !== true) return false;
  return isAdminEmail(claims.email, env);
}

export function buildAuthOptions(env: Env = process.env): NextAuthOptions {
  const client = googleClient(env);
  const issuer = testIssuer(env);
  return {
    providers: client
      ? [
          GoogleProvider({
            clientId: client.clientId,
            clientSecret: client.clientSecret,
            // Always ask which account, rather than silently reusing one: John has two.
            authorization: { params: { scope: "openid email profile", prompt: "select_account" } },
            ...(issuer ? { wellKnown: `${issuer}/.well-known/openid-configuration` } : {}),
          }),
        ]
      : [],
    session: { strategy: "jwt", maxAge: SESSION_DAYS * 24 * 60 * 60 },
    pages: { signIn: "/signin", error: "/not-allowed" },
    callbacks: {
      signIn({ account, profile }) {
        return admits(account?.provider, profile, env);
      },
      /* Only what the toolbar shows and the gate reads. No access or refresh token is kept: the site never calls Google. */
      jwt({ token }) {
        return { email: typeof token.email === "string" ? token.email : undefined, name: token.name, sub: token.sub };
      },
    },
    secret: authSecret(env) ?? undefined,
  };
}
