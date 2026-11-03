import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COOKIE_NAME, TEST_ADMINS, TEST_SECRET, sessionToken } from "@/lib/auth/testSession";

const { forgetScorecard, forgetDashboardData } = vi.hoisted(() => ({ forgetScorecard: vi.fn(), forgetDashboardData: vi.fn() }));
vi.mock("@/lib/scorecard/data", () => ({ forgetScorecard }));
vi.mock("@/lib/dashboard-data", () => ({ forgetDashboardData }));

const { POST } = await import("./route");

const HOST = "localhost:6510";
async function post({ cookie = true, origin = `http://${HOST}` }: { cookie?: boolean | string; origin?: string | null } = {}) {
  const headers: Record<string, string> = { host: HOST };
  if (origin) headers.origin = origin;
  if (cookie) headers.cookie = `${COOKIE_NAME}=${typeof cookie === "string" ? cookie : await sessionToken("john@spxis.com")}`;
  const res = await POST(new NextRequest(`http://${HOST}/packages/refresh`, { method: "POST", headers }));
  return { status: res.status, body: await res.json(), cache: res.headers.get("cache-control") };
}

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", TEST_SECRET);
  vi.stubEnv("SUMILABU_ADMIN_EMAILS", TEST_ADMINS);
  vi.stubEnv("NEXTAUTH_URL", "");
  vi.stubEnv("VERCEL", "");
  forgetScorecard.mockClear();
  forgetDashboardData.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /packages/refresh", () => {
  it("clears the scorecard's and the dashboard's cached reads for John's own page", async () => {
    expect(await post()).toEqual({ status: 200, body: { ok: true }, cache: "no-store" });
    expect(forgetScorecard).toHaveBeenCalledTimes(1);
    expect(forgetDashboardData).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["no session", { cookie: false }, 401],
    ["a forged cookie", { cookie: "forged" }, 401],
    ["another site", { origin: "https://evil.example" }, 403],
    ["no Origin", { origin: null }, 403],
  ] as const)("refuses %s and clears nothing", async (_label, opts, status) => {
    expect((await post(opts)).status).toBe(status);
    expect(forgetScorecard).not.toHaveBeenCalled();
    expect(forgetDashboardData).not.toHaveBeenCalled();
  });
});
