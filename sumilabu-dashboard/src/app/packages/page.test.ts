import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COOKIE_NAME, TEST_ADMINS, TEST_SECRET, jar, sessionToken } from "@/lib/auth/testSession";
import { parseScorecard } from "@/lib/scorecard/contract";
import sample from "@/lib/scorecard/fixtures/sample.json";

const { getScorecard, cookieJar, redirect } = vi.hoisted(() => ({
  getScorecard: vi.fn(),
  cookieJar: { current: {} as Record<string, string> },
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));

vi.mock("@/lib/scorecard/data", () => ({ getScorecard }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({ cookies: async () => jar(cookieJar.current) }));

const parsed = parseScorecard(sample);
if (!parsed.ok) throw new Error("sample must parse");
const data = { doc: parsed.doc, receivedAt: "2026-11-02T23:05:00.000Z", trend: [] };

const { default: Page, metadata, dynamic } = await import("./page");
const render = async () => renderToStaticMarkup(await Page());

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AUTH_SECRET", TEST_SECRET);
  vi.stubEnv("SUMILABU_ADMIN_EMAILS", TEST_ADMINS);
  vi.stubEnv("NEXTAUTH_URL", "");
  vi.stubEnv("VERCEL", "");
  cookieJar.current = {};
  getScorecard.mockResolvedValue(data);
});
afterEach(() => vi.unstubAllEnvs());

describe("the /packages page is private", () => {
  it.each([
    ["no session", async () => ({})],
    ["a forged cookie", async () => ({ [COOKIE_NAME]: "forged" })],
    ["a session for an address not on the list", async () => ({ [COOKIE_NAME]: await sessionToken("stranger@gmail.com") })],
    ["an expired session", async () => ({ [COOKIE_NAME]: await sessionToken("john@spxis.com", { maxAge: -60 }) })],
  ])("sends %s to the sign-in before reading anything", async (_label, cookies) => {
    cookieJar.current = await cookies();
    await expect(render()).rejects.toThrow("NEXT_REDIRECT /signin");
    expect(getScorecard).not.toHaveBeenCalled();
  });

  it("is nobody's when the deployment has no secret", async () => {
    cookieJar.current = { [COOKIE_NAME]: await sessionToken("john@spxis.com") };
    vi.stubEnv("AUTH_SECRET", "");
    await expect(render()).rejects.toThrow("NEXT_REDIRECT /signin");
    expect(getScorecard).not.toHaveBeenCalled();
  });

  it("draws the scorecard for the signed-in admin", async () => {
    cookieJar.current = { [COOKIE_NAME]: await sessionToken("john@johnmorris.ca") };
    const html = await render();
    expect(getScorecard).toHaveBeenCalledTimes(1);
    expect(html).toContain("Package scorecard");
    expect(html).toContain("kazoku-ui");
    expect(html).toContain(parsed.doc.items[0].name);
  });

  it("stays noindex and dynamic", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(dynamic).toBe("force-dynamic");
  });
});
