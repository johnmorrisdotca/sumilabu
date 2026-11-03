import { describe, expect, it } from "vitest";

import { decide, isPublicPath, isTokenApi, signInLocation } from "./gate";

const base = { search: "", admin: false };

describe("the gate", () => {
  it("sends a signed-out visitor of any page to the sign-in, remembering where they were going", () => {
    expect(decide({ ...base, pathname: "/" })).toEqual({ kind: "redirect", location: "/signin" });
    expect(decide({ ...base, pathname: "/packages" })).toEqual({ kind: "redirect", location: "/signin?callbackUrl=%2Fpackages" });
    expect(decide({ ...base, pathname: "/", search: "?project=onibako" })).toEqual({ kind: "redirect", location: "/signin?callbackUrl=%2F%3Fproject%3Donibako" });
  });

  it("closes a page nobody has written yet, by default", () => {
    for (const pathname of ["/admin", "/reports", "/docs", "/packages/anything", "/signin/../packages", "/api", "/apidocs", "/_next/data/x.json"]) {
      expect(decide({ ...base, pathname }).kind).toBe("redirect");
    }
  });

  it("lets the signed-in admin through", () => {
    expect(decide({ ...base, pathname: "/", admin: true })).toEqual({ kind: "pass" });
    expect(decide({ ...base, pathname: "/packages", admin: true })).toEqual({ kind: "pass" });
  });

  it("leaves the sign-in pages, next-auth's routes and the browser's own files open", () => {
    for (const pathname of ["/signin", "/not-allowed", "/api/auth/signin/google", "/api/auth/callback/google", "/api/auth/csrf", "/favicon.ico", "/sumilabu.png", "/robots.txt"]) {
      expect(decide({ ...base, pathname })).toEqual({ kind: "pass" });
    }
  });

  it("never touches the token API, signed in or not", () => {
    for (const pathname of ["/api/v1/projects/umakuma/tickets", "/api/device-stats", "/api/health", "/api/openapi.json"]) {
      expect(decide({ ...base, pathname })).toEqual({ kind: "pass" });
    }
  });
});

describe("the gate's pieces", () => {
  it("knows which paths are the token API", () => {
    expect(isTokenApi("/api/v1/health")).toBe(true);
    expect(isTokenApi("/api/auth/csrf")).toBe(false);
    expect(isTokenApi("/api")).toBe(false);
    expect(isTokenApi("/apis/x")).toBe(false);
  });

  it("opens only exact public paths, not anything that starts like one", () => {
    expect(isPublicPath("/signin")).toBe(true);
    expect(isPublicPath("/signin/x")).toBe(false);
    expect(isPublicPath("/signinx")).toBe(false);
    expect(isPublicPath("/robots.txt.bak")).toBe(false);
  });

  it("writes the sign-in address", () => {
    expect(signInLocation("/", "")).toBe("/signin");
    expect(signInLocation("/packages", "")).toBe("/signin?callbackUrl=%2Fpackages");
  });
});
