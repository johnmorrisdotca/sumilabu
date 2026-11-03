/**
 * Whether a write came from one of this site's own pages (SUMILABU-9).
 *
 * The session cookie alone is not enough for a write: a page on another site
 * can make John's browser send it. So a page's POST must also carry an
 * `Origin` naming this very host (the host the request was addressed to, as
 * Vercel's router or `next dev` saw it) and, when the browser sends it,
 * `Sec-Fetch-Site: same-origin`. No `Origin` at all is refused: every browser
 * this page supports sends one on a POST. The same rule Next applies to its
 * own Server Actions, written out so it has a test.
 */
export function sameOriginWrite(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim().toLowerCase();
  if (!host || originHost !== host) return false;
  const site = headers.get("sec-fetch-site");
  return site === null || site === "same-origin";
}
