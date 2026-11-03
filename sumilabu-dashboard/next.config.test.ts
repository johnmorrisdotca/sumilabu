import { describe, expect, it } from "vitest";

import nextConfig, { NOT_TOKEN_API, OTHER_HOSTS, PAGES_HOST } from "./next.config";

describe("pages live on app.sumilabu.com", () => {
  it("sends every page and next-auth route on the other names there, temporarily", async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects).toHaveLength(OTHER_HOSTS.length);
    for (const [i, host] of OTHER_HOSTS.entries()) {
      expect(redirects[i]).toEqual({ source: NOT_TOKEN_API, has: [{ type: "host", value: host }], destination: `https://${PAGES_HOST}/:path`, permanent: false });
    }
    expect(OTHER_HOSTS).not.toContain(PAGES_HOST);
  });

  it("leaves the token API alone on every name", () => {
    /* The `:path(...)` group as path-to-regexp compiles it, anchored. */
    const group = NOT_TOKEN_API.slice("/:path(".length, -1);
    const matches = (path: string) => new RegExp(`^/(${group})$`).test(path);
    for (const path of ["/", "/packages", "/signin", "/api/auth/callback/google", "/api", "/apidocs", "/future"]) expect(matches(path), path).toBe(true);
    for (const path of ["/api/v1/projects/umakuma/tickets", "/api/device-stats", "/api/health", "/api/openapi.json"]) expect(matches(path), path).toBe(false);
  });
});
