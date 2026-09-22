import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

/*
 * Discovery only: a client that already holds one project's board token
 * asks this to learn which other project keys are configured, so it knows
 * `itsutsu` is real before it is separately handed a token for it. The list
 * itself is not a credential - see "Tokens and projects" in BOARD_RULES.md.
 */
beforeEach(() => {
  vi.stubEnv("BOARD_TOKENS_JSON", JSON.stringify({ umakuma: "uk-token", itsutsu: "its-token", "umakuma-dev": "uk-dev-token" }));
});

function request(token?: string) {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers.authorization = `Bearer ${token}`;
  return new NextRequest("http://localhost/api/v1/projects", { headers });
}

describe("GET /api/v1/projects", () => {
  it("lists every configured project key under any one of their tokens", async () => {
    for (const token of ["uk-token", "its-token", "uk-dev-token"]) {
      const res = await GET(request(token));
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ok: true, projects: ["itsutsu", "umakuma", "umakuma-dev"] });
    }
  });

  it("refuses a missing, malformed or unrecognized token", async () => {
    for (const req of [request(), request("not-a-real-token")]) {
      const res = await GET(req);
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ ok: false, error: "unauthorized" });
    }
  });

  it("never accepts a settings token in place of a board one", async () => {
    vi.stubEnv("SETTINGS_TOKENS_JSON", JSON.stringify({ umakuma: "settings-only" }));
    const res = await GET(request("settings-only"));
    expect(res.status).toBe(401);
  });
});
