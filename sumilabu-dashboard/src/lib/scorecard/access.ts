import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * Who may see /packages: whoever holds SCORECARD_VIEW_KEY (John, from the
 * keychain). A separate key from SCORECARD_TOKEN, which uploads: a leaked view
 * key reads the page and cannot write to it, and the other way round.
 *
 * A right key gives a cookie holding `<expiry>.<HMAC(key, expiry)>`, never the
 * key. The expiry is checked here, on the server, as well as by the browser's
 * Max-Age, and changing the key at Vercel signs everybody out. Nothing is kept
 * in a table, so nothing here can grow or be filled by a stranger.
 */

export const VIEW_COOKIE = "scorecard_view";
export const VIEW_COOKIE_PATH = "/packages";
export const VIEW_SESSION_SECONDS = 30 * 24 * 60 * 60;
/** A wrong key waits this long before it is answered: slow enough to make guessing pointless, with no counter to keep. */
export const WRONG_KEY_DELAY_MS = 1000;

export function viewKey(env: Record<string, string | undefined> = process.env): string | null {
  const key = env.SCORECARD_VIEW_KEY;
  return key && key.length > 0 ? key : null;
}

function mac(key: string, text: string): string {
  return createHmac("sha256", key).update(`scorecard-view-v1:${text}`).digest("hex");
}

/** Constant time and length-blind: both sides are hashed to the same length first. */
export function sameSecret(presented: string, expected: string): boolean {
  const a = createHmac("sha256", "scorecard-compare").update(presented).digest();
  const b = createHmac("sha256", "scorecard-compare").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function keyMatches(presented: string, key: string | null = viewKey()): boolean {
  return key !== null && sameSecret(presented, key);
}

/** The cookie to set after a right key: valid for 30 days from `now`. */
export function makeViewCookie(key: string, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + VIEW_SESSION_SECONDS;
  return `${expires}.${mac(key, String(expires))}`;
}

/** True only for a cookie made with the current key and not yet expired. No key set means nobody. */
export function viewCookieValid(value: string | undefined, key: string | null = viewKey(), now = Date.now()): boolean {
  if (!key || !value) return false;
  const dot = value.indexOf(".");
  if (dot < 1) return false;
  const expires = value.slice(0, dot);
  if (!/^\d{1,12}$/.test(expires) || Number(expires) * 1000 < now) return false;
  return sameSecret(value.slice(dot + 1), mac(key, expires));
}

/** The browser sent this from our own pages: Origin names our host, or (no Origin) Fetch Metadata says same-origin. */
export function sameOriginPost(headers: Headers): boolean {
  const origin = headers.get("origin");
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (origin) {
    try {
      return host !== null && new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  return headers.get("sec-fetch-site") === "same-origin";
}

export function cookieHeader(value: string, maxAgeSeconds: number, secure: boolean): string {
  return [`${VIEW_COOKIE}=${value}`, `Path=${VIEW_COOKIE_PATH}`, `Max-Age=${maxAgeSeconds}`, "HttpOnly", "SameSite=Strict", ...(secure ? ["Secure"] : [])].join("; ");
}
