/**
 * Who may open the site's pages: the Google addresses in SUMILABU_ADMIN_EMAILS
 * (a comma list), and nobody else.
 *
 * SumiLabu was open to anyone on 2026-11-03 (SUMILABU-7): the dashboard showed
 * every device, project and app source to whoever typed the address. The pages
 * are John's alone; agents and apps use the API with their per-project tokens
 * and never a page.
 *
 * Server-only on purpose, like umakuma's ADMIN_GOOGLE_ALLOWED_EMAILS: a
 * `NEXT_PUBLIC_` variable is compiled into every visitor's bundle and would
 * publish who the admins are. An unset or empty variable is an empty list, so
 * a deployment without it lets nobody in rather than everybody.
 */
export const ADMIN_EMAILS_ENV = "SUMILABU_ADMIN_EMAILS";

type Env = Record<string, string | undefined>;

/** Lower case and trimmed: Google's addresses are case-insensitive, and so is this list. */
export function foldEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function adminEmails(env: Env = process.env): Set<string> {
  return new Set(
    (env[ADMIN_EMAILS_ENV] ?? "")
      .split(",")
      .map(foldEmail)
      .filter((value) => value.includes("@")),
  );
}

export function isAdminEmail(email: unknown, env: Env = process.env): boolean {
  if (typeof email !== "string" || email.length === 0) return false;
  return adminEmails(env).has(foldEmail(email));
}
