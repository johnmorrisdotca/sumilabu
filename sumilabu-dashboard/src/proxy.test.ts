import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COOKIE_NAME, TEST_ADMINS, TEST_SECRET, sessionToken } from "@/lib/auth/testSession";
import { config, proxy } from "./proxy";

function request(url: string, { cookie }: { cookie?: string } = {}): NextRequest {
  return new NextRequest(url, { headers: { host: new URL(url).host, ...(cookie ? { cookie } : {}) } });
}

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", TEST_SECRET);
  vi.stubEnv("SUMILABU_ADMIN_EMAILS", TEST_ADMINS);
  vi.stubEnv("NEXTAUTH_URL", "http://localhost:6510");
  vi.stubEnv("VERCEL", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("proxy", () => {
  it("redirects a signed-out page view to the sign-in, with no body and no caching", async () => {
    const res = await proxy(request("http://localhost:6510/packages"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:6510/signin?callbackUrl=%2Fpackages");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("passes the signed-in admin", async () => {
    const cookie = `${COOKIE_NAME}=${await sessionToken("john@spxis.com")}`;
    const res = await proxy(request("http://localhost:6510/", { cookie }));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("does not pass a valid session for an address that is not on the list", async () => {
    const cookie = `${COOKIE_NAME}=${await sessionToken("stranger@gmail.com")}`;
    const res = await proxy(request("http://localhost:6510/", { cookie }));
    expect(res.status).toBe(307);
  });

  it("leaves the token API alone, with or without a cookie", async () => {
    const res = await proxy(request("http://localhost:6510/api/v1/projects/umakuma/tickets"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("matches pages and next-auth's routes, and not the token API or Next's static files", () => {
    const [source] = config.matcher;
    /* Next anchors the matcher to the whole path; this is the same expression. */
    const matches = (path: string) => new RegExp(`^${source}$`).test(path);
    for (const path of ["/", "/packages", "/signin", "/api/auth/callback/google", "/future-page", "/api", "/apidocs"]) expect(matches(path), path).toBe(true);
    for (const path of ["/api/v1/health", "/api/device-stats", "/api/openapi.json", "/_next/static/chunk.js", "/_next/image", "/favicon.ico"]) expect(matches(path), path).toBe(false);
  });
});
