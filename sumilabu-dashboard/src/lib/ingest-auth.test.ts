import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isAuthorizedIngest } from "./ingest-auth";

const req = (auth?: string) => new NextRequest("https://api.sumilabu.com/api/device-stats", { method: "POST", headers: auth ? { authorization: auth } : {} });

afterEach(() => vi.unstubAllEnvs());

describe("isAuthorizedIngest", () => {
  it("takes the project's own token, else the fallback, and nothing else", () => {
    vi.stubEnv("PROJECT_TOKENS_JSON", JSON.stringify({ onibako: "oni-token" }));
    vi.stubEnv("INGEST_API_TOKEN", "fallback-token");
    expect(isAuthorizedIngest(req("Bearer oni-token"), "onibako")).toBe(true);
    expect(isAuthorizedIngest(req("Bearer fallback-token"), "onibako")).toBe(false);
    expect(isAuthorizedIngest(req("Bearer fallback-token"), "inkyframe")).toBe(true);
    for (const auth of [undefined, "Bearer ", "Bearer oni-token-x", "Bearer oni-toke", "oni-token", "Basic oni-token"]) {
      expect(isAuthorizedIngest(req(auth), "onibako")).toBe(false);
    }
  });

  it("stays open when no token is configured at all (unchanged, deliberate)", () => {
    vi.stubEnv("PROJECT_TOKENS_JSON", "");
    vi.stubEnv("INGEST_API_TOKEN", "");
    expect(isAuthorizedIngest(req(), "inkyframe")).toBe(true);
  });
});
