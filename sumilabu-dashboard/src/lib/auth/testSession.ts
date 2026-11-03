import { encode } from "next-auth/jwt";

/**
 * For tests only: a session cookie exactly as next-auth would set it after a
 * Google sign-in, made with the test secret. Never imported by app code.
 */
export const TEST_SECRET = "test-secret-for-sumilabu-auth-0123456789abcdef";
export const TEST_ADMINS = "john@spxis.com, John@JohnMorris.ca";
export const COOKIE_NAME = "next-auth.session-token";

export function testEnv(extra: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return { NODE_ENV: "test", AUTH_SECRET: TEST_SECRET, SUMILABU_ADMIN_EMAILS: TEST_ADMINS, ...extra };
}

export async function sessionToken(email: string, { secret = TEST_SECRET, maxAge = 3600 }: { secret?: string; maxAge?: number } = {}): Promise<string> {
  return encode({ token: { email, name: "John Morris", sub: "google-sub-1" }, secret, maxAge });
}

export function jar(entries: Record<string, string>): { getAll(): Array<{ name: string; value: string }>; get(name: string): { name: string; value: string } | undefined } {
  return {
    getAll: () => Object.entries(entries).map(([name, value]) => ({ name, value })),
    get: (name: string) => (name in entries ? { name, value: entries[name] } : undefined),
  };
}
