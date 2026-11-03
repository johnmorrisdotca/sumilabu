/**
 * Where to go after signing in: a path on this site and nothing else. next-auth
 * refuses another origin too; this keeps a crafted `?callbackUrl=` from even
 * reaching it, and drops anything that is not a plain path (`//host`, `/\host`,
 * a scheme).
 */
export function safeCallback(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || raw.length > 512) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (/[\u0000-\u001f]/.test(raw)) return "/";
  return raw;
}
