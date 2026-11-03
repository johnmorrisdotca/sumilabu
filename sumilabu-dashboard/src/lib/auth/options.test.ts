import { describe, expect, it } from "vitest";

import { admits, authSecret, buildAuthOptions, isGoogleAuthConfigured, testIssuer } from "./options";
import { TEST_SECRET, testEnv } from "./testSession";

const google = { GOOGLE_CLIENT_ID: "id.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "client-secret" };

describe("who a Google sign-in admits", () => {
  const env = testEnv();
  it("an address on the list that Google has verified", () => {
    expect(admits("google", { email: "john@spxis.com", email_verified: true }, env)).toBe(true);
    expect(admits("google", { email: "JOHN@johnmorris.ca", email_verified: true }, env)).toBe(true);
  });

  it("nobody else: a stranger, an unverified address, another provider, no profile", () => {
    expect(admits("google", { email: "stranger@gmail.com", email_verified: true }, env)).toBe(false);
    expect(admits("google", { email: "john@spxis.com", email_verified: false }, env)).toBe(false);
    expect(admits("google", { email: "john@spxis.com" }, env)).toBe(false);
    expect(admits("google", { email: "john@spxis.com", email_verified: "true" }, env)).toBe(false);
    expect(admits("github", { email: "john@spxis.com", email_verified: true }, env)).toBe(false);
    expect(admits(undefined, undefined, env)).toBe(false);
  });

  it("nobody at all when the list is unset", () => {
    expect(admits("google", { email: "john@spxis.com", email_verified: true }, testEnv({ SUMILABU_ADMIN_EMAILS: undefined }))).toBe(false);
  });
});

describe("configuration", () => {
  it("treats a short or missing secret as none", () => {
    expect(authSecret({ AUTH_SECRET: "short" })).toBeNull();
    expect(authSecret({})).toBeNull();
    expect(authSecret({ NEXTAUTH_SECRET: TEST_SECRET })).toBe(TEST_SECRET);
  });

  it("is configured only with a client and a secret", () => {
    expect(isGoogleAuthConfigured(testEnv(google))).toBe(true);
    expect(isGoogleAuthConfigured(testEnv())).toBe(false);
    expect(isGoogleAuthConfigured({ ...google })).toBe(false);
    expect(isGoogleAuthConfigured({ AUTH_GOOGLE_ID: "a", AUTH_GOOGLE_SECRET: "b", AUTH_SECRET: TEST_SECRET })).toBe(true);
  });

  it("has no provider without a client, so no sign-in can happen", () => {
    expect(buildAuthOptions(testEnv()).providers).toEqual([]);
    expect(buildAuthOptions(testEnv(google)).providers).toHaveLength(1);
  });

  it("uses its own sign-in and refusal pages, JWT sessions of 30 days", () => {
    const options = buildAuthOptions(testEnv(google));
    expect(options.pages).toEqual({ signIn: "/signin", error: "/not-allowed" });
    expect(options.session).toEqual({ strategy: "jwt", maxAge: 30 * 24 * 60 * 60 });
  });

  it("keeps only the address, name and subject in the session, never a Google token", async () => {
    const jwt = buildAuthOptions(testEnv(google)).callbacks!.jwt!;
    const token = await jwt({ token: { email: "john@spxis.com", name: "John", sub: "1", picture: "p", access_token: "secret" } } as never);
    expect(token).toEqual({ email: "john@spxis.com", name: "John", sub: "1" });
  });
});

describe("the stand-in for Google", () => {
  it("is read only in development or test, and only for a loopback http address", () => {
    expect(testIssuer({ NODE_ENV: "development", SUMILABU_GOOGLE_TEST_ISSUER: "http://127.0.0.1:6551" })).toBe("http://127.0.0.1:6551");
    expect(testIssuer({ NODE_ENV: "test", SUMILABU_GOOGLE_TEST_ISSUER: "http://localhost:6551" })).toBe("http://localhost:6551");
    expect(testIssuer({ NODE_ENV: "production", SUMILABU_GOOGLE_TEST_ISSUER: "http://127.0.0.1:6551" })).toBeNull();
    expect(testIssuer({ SUMILABU_GOOGLE_TEST_ISSUER: "http://127.0.0.1:6551" })).toBeNull();
    expect(testIssuer({ NODE_ENV: "prod", SUMILABU_GOOGLE_TEST_ISSUER: "http://127.0.0.1:6551" })).toBeNull();
    expect(testIssuer({ NODE_ENV: "development", SUMILABU_GOOGLE_TEST_ISSUER: "https://evil.example" })).toBeNull();
  });

  it("points the provider's discovery at it when set", () => {
    const options = buildAuthOptions({ ...testEnv(google), NODE_ENV: "development", SUMILABU_GOOGLE_TEST_ISSUER: "http://127.0.0.1:6551" });
    const provider = options.providers[0] as unknown as { options: { wellKnown?: string } };
    expect(provider.options.wellKnown).toBe("http://127.0.0.1:6551/.well-known/openid-configuration");
    const real = buildAuthOptions({ ...testEnv(google), NODE_ENV: "production", SUMILABU_GOOGLE_TEST_ISSUER: "http://127.0.0.1:6551" });
    expect((real.providers[0] as unknown as { options: { wellKnown?: string } }).options.wellKnown).toBeUndefined();
  });
});
