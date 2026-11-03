import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { adminFromCookies, type Admin } from "./session";

/** The signed-in admin for this request, read from the session cookie alone. */
export async function currentAdmin(): Promise<Admin | null> {
  return adminFromCookies(await cookies());
}

/**
 * The first line of every private page, before any data is read.
 *
 * The gate in `proxy.ts` already turns a stranger away before the page runs;
 * this is the second lock, for the day a matcher is changed or a route is
 * moved (Next's own advice: verify inside the page, not only in Proxy). It
 * costs one cookie decryption and never touches Neon.
 */
export async function requireAdmin(): Promise<Admin> {
  const admin = await currentAdmin();
  if (!admin) redirect("/signin");
  return admin;
}
