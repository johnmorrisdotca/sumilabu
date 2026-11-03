import { describe, expect, it } from "vitest";

import { adminFromCookies, secureCookie } from "./session";
import { COOKIE_NAME, jar, sessionToken, testEnv } from "./testSession";

describe("adminFromCookies", () => {
  const env = testEnv();

  it("reads the signed-in admin from next-auth's cookie", async () => {
    const admin = await adminFromCookies(jar({ [COOKIE_NAME]: await sessionToken("john@spxis.com") }), env);
    expect(admin).toEqual({ email: "john@spxis.com", name: "John Morris" });
  });

  it("uses the __Secure- name on an https site", async () => {
    const httpsEnv = testEnv({ NEXTAUTH_URL: "https://app.sumilabu.com" });
    const token = await sessionToken("john@johnmorris.ca");
    expect(await adminFromCookies(jar({ "__Secure-next-auth.session-token": token }), httpsEnv)).not.toBeNull();
    expect(await adminFromCookies(jar({ [COOKIE_NAME]: token }), httpsEnv)).toBeNull();
  });

  it("is nobody with no cookie, a forged one, one made with another secret, or an expired one", async () => {
    expect(await adminFromCookies(jar({}), env)).toBeNull();
    expect(await adminFromCookies(jar({ [COOKIE_NAME]: "not-a-jwe" }), env)).toBeNull();
    expect(await adminFromCookies(jar({ [COOKIE_NAME]: await sessionToken("john@spxis.com", { secret: "another-secret-another-secret-another-secret" }) }), env)).toBeNull();
    expect(await adminFromCookies(jar({ [COOKIE_NAME]: await sessionToken("john@spxis.com", { maxAge: -60 }) }), env)).toBeNull();
  });

  it("is nobody for an address taken off the list after it signed in", async () => {
    const token = await sessionToken("someone@spxis.com");
    expect(await adminFromCookies(jar({ [COOKIE_NAME]: token }), env)).toBeNull();
    const before = await sessionToken("john@johnmorris.ca");
    expect(await adminFromCookies(jar({ [COOKIE_NAME]: before }), testEnv({ SUMILABU_ADMIN_EMAILS: "john@spxis.com" }))).toBeNull();
  });

  it("is nobody when the deployment has no secret, even with a cookie that was once good", async () => {
    const token = await sessionToken("john@spxis.com");
    expect(await adminFromCookies(jar({ [COOKIE_NAME]: token }), testEnv({ AUTH_SECRET: undefined }))).toBeNull();
  });
});

describe("secureCookie", () => {
  it("follows NEXTAUTH_URL, else Vercel", () => {
    expect(secureCookie({ NEXTAUTH_URL: "https://app.sumilabu.com" })).toBe(true);
    expect(secureCookie({ NEXTAUTH_URL: "http://localhost:6510", VERCEL: "1" })).toBe(false);
    expect(secureCookie({ VERCEL: "1" })).toBe(true);
    expect(secureCookie({})).toBe(false);
  });
});
