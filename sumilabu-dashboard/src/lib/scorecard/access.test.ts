import { describe, expect, it } from "vitest";

import { VIEW_SESSION_SECONDS, cookieHeader, keyMatches, makeViewCookie, sameOriginPost, sameSecret, viewCookieValid, viewKey } from "./access";

const KEY = "view-key-for-tests";
const NOW = Date.UTC(2026, 10, 2, 12);

describe("the view key", () => {
  it("is null when unset or empty, so the page does not exist", () => {
    expect(viewKey({})).toBeNull();
    expect(viewKey({ SCORECARD_VIEW_KEY: "" })).toBeNull();
    expect(viewKey({ SCORECARD_VIEW_KEY: KEY })).toBe(KEY);
  });

  it("matches only the exact key, of any length, and never when none is set", () => {
    expect(keyMatches(KEY, KEY)).toBe(true);
    for (const wrong of ["", "x", `${KEY}x`, KEY.slice(1), KEY.toUpperCase()]) expect(keyMatches(wrong, KEY)).toBe(false);
    expect(keyMatches("", null)).toBe(false);
    expect(sameSecret("a", "a")).toBe(true);
    expect(sameSecret("a", "ab")).toBe(false);
  });
});

describe("the view cookie", () => {
  it("is valid for 30 days with the key it was made with, and holds no trace of the key", () => {
    const cookie = makeViewCookie(KEY, NOW);
    expect(cookie).not.toContain(KEY);
    expect(viewCookieValid(cookie, KEY, NOW)).toBe(true);
    expect(viewCookieValid(cookie, KEY, NOW + (VIEW_SESSION_SECONDS - 60) * 1000)).toBe(true);
    expect(viewCookieValid(cookie, KEY, NOW + (VIEW_SESSION_SECONDS + 60) * 1000)).toBe(false);
  });

  it("is refused after the key changes, when edited, or when it is junk", () => {
    const cookie = makeViewCookie(KEY, NOW);
    expect(viewCookieValid(cookie, "another-key", NOW)).toBe(false);
    const [expires, mac] = cookie.split(".");
    expect(viewCookieValid(`${Number(expires) + 99999}.${mac}`, KEY, NOW)).toBe(false);
    for (const junk of [undefined, "", "x", ".", "abc.def", "9999999999.", `${expires}.${"0".repeat(64)}`, "-1.aa"]) expect(viewCookieValid(junk, KEY, NOW)).toBe(false);
  });

  it("is refused for everyone when the deployment has no key", () => {
    expect(viewCookieValid(makeViewCookie(KEY, NOW), null, NOW)).toBe(false);
  });

  it("is written HttpOnly, SameSite=Strict and Path=/packages, Secure when asked", () => {
    const header = cookieHeader("v", 2592000, true);
    for (const part of ["Path=/packages", "Max-Age=2592000", "HttpOnly", "SameSite=Strict", "Secure"]) expect(header).toContain(part);
    expect(cookieHeader("v", 0, false)).not.toContain("Secure");
  });
});

describe("sameOriginPost", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("accepts our own host as Origin, or Fetch Metadata same-origin when there is no Origin", () => {
    expect(sameOriginPost(h({ origin: "https://app.sumilabu.com", host: "app.sumilabu.com" }))).toBe(true);
    expect(sameOriginPost(h({ "sec-fetch-site": "same-origin", host: "app.sumilabu.com" }))).toBe(true);
  });
  it("refuses another origin, a missing proof, and a malformed Origin", () => {
    expect(sameOriginPost(h({ origin: "https://evil.example", host: "app.sumilabu.com" }))).toBe(false);
    expect(sameOriginPost(h({ host: "app.sumilabu.com" }))).toBe(false);
    expect(sameOriginPost(h({ "sec-fetch-site": "cross-site", host: "app.sumilabu.com" }))).toBe(false);
    expect(sameOriginPost(h({ origin: "not a url", host: "app.sumilabu.com" }))).toBe(false);
    expect(sameOriginPost(h({ origin: "https://app.sumilabu.com" }))).toBe(false);
  });
});
