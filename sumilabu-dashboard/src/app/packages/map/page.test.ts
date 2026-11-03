import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COOKIE_NAME, TEST_ADMINS, TEST_SECRET, jar, sessionToken } from "@/lib/auth/testSession";
import { parseScorecard } from "@/lib/scorecard/contract";
import run from "@/lib/scorecard/fixtures/map-run.json";

const { getScorecard, loadFavourites, cookieJar } = vi.hoisted(() => ({ getScorecard: vi.fn(), loadFavourites: vi.fn(), cookieJar: { current: {} as Record<string, string> } }));
vi.mock("@/lib/scorecard/data", () => ({ getScorecard }));
vi.mock("@/lib/scorecard/favourites-store", () => ({ loadFavourites }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("next/headers", () => ({ cookies: async () => jar(cookieJar.current) }));

const parsed = parseScorecard(run);
if (!parsed.ok) throw new Error("map run must parse");
const { default: Page, metadata } = await import("./page");
const { PackagesByFamily, OutsideDependencies, WatchPoints } = await import("@/components/package-map/map-tables");
const { createElement } = await import("react");
const render = async () => renderToStaticMarkup(await Page());

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AUTH_SECRET", TEST_SECRET);
  vi.stubEnv("SUMILABU_ADMIN_EMAILS", TEST_ADMINS);
  vi.stubEnv("NEXTAUTH_URL", "");
  vi.stubEnv("VERCEL", "");
  cookieJar.current = {};
  getScorecard.mockResolvedValue({ doc: parsed.doc, receivedAt: "", trend: [] });
  loadFavourites.mockResolvedValue(["chizu"]);
});
afterEach(() => vi.unstubAllEnvs());

describe("the package map page", () => {
  it.each([
    ["no session", async () => ({})],
    ["a session for an address not on the list", async () => ({ [COOKIE_NAME]: await sessionToken("stranger@gmail.com") })],
  ])("sends %s to the sign-in before reading anything", async (_label, cookies) => {
    cookieJar.current = await cookies();
    await expect(render()).rejects.toThrow("NEXT_REDIRECT /signin");
    expect(getScorecard).not.toHaveBeenCalled();
    expect(loadFavourites).not.toHaveBeenCalled();
  });

  it("draws the map from the run, every package a link to its scorecard, the favourites with their hearts", async () => {
    cookieJar.current = { [COOKIE_NAME]: await sessionToken("john@spxis.com") };
    const out = await render();
    expect(out).toContain("How the packages fit together");
    expect((out.match(/data-map-pill="/g) ?? []).length).toBe(parsed.doc.items.filter((i) => i.kind === "package").length);
    expect(out).toContain('href="/packages#item=kazoku-ui"');
    expect(out).toContain('data-map-link="wakusei-planets&gt;chikyu-earth" data-optional="true"');
    expect(out).toContain('data-map-link="chikyu-earth&gt;chizu" data-optional="false"');
    expect((out.match(/data-map-heart/g) ?? []).length).toBe(1);
    expect(out).toContain('data-testid="library-cards"');
    expect(out).toContain("<desc");
    expect(out).toContain('role="tablist"');
    expect(out).not.toContain("<details");
  });

  it("stays noindex", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});

describe("the map's tables", () => {
  const favs = new Set(["chizu"]);

  it("has a table per family, each package linked to its scorecard", () => {
    const out = renderToStaticMarkup(createElement(PackagesByFamily, { doc: parsed.doc, favourites: favs }));
    expect((out.match(/data-testid="family-row"/g) ?? []).length).toBe(parsed.doc.items.filter((i) => i.kind === "package").length);
    expect(out).toContain("3D views · 6");
    expect(out).toContain("chizu ^1.6.0; kazoku-ui &gt;=0.9.0 (optional)");
    expect(out).toContain('aria-label="favourite"');
  });

  it("lists the outside libraries and the apps", () => {
    const out = renderToStaticMarkup(createElement(OutsideDependencies, { doc: parsed.doc, favourites: favs }));
    expect(out).toContain(">d3-geo<");
    expect(out).toContain("ISC");
    expect((out.match(/data-testid="app-row"/g) ?? []).length).toBe(parsed.doc.apps.length);
  });

  it("lists the watch points the run shows", () => {
    const out = renderToStaticMarkup(createElement(WatchPoints, { doc: parsed.doc }));
    expect(out).toContain("kazoku-ui versions drift");
    expect(out).toContain("Licence fields");
  });
});
