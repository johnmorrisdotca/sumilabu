import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VIEW_COOKIE, makeViewCookie } from "@/lib/scorecard/access";
import { parseScorecard } from "@/lib/scorecard/contract";
import sample from "@/lib/scorecard/fixtures/sample.json";

const KEY = "page-test-view-key";
const { getScorecard, cookieValue, notFound } = vi.hoisted(() => ({
  getScorecard: vi.fn(),
  cookieValue: { current: undefined as string | undefined },
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/scorecard/data", () => ({ getScorecard }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === VIEW_COOKIE && cookieValue.current ? { name, value: cookieValue.current } : undefined) }),
}));

const parsed = parseScorecard(sample);
if (!parsed.ok) throw new Error("sample must parse");
const data = { doc: parsed.doc, receivedAt: "2026-11-02T23:05:00.000Z", trend: [] };

const { default: Page, metadata, dynamic } = await import("./page");
const render = async (searchParams?: { denied?: string }) => renderToStaticMarkup(await Page({ searchParams: Promise.resolve(searchParams ?? {}) }));
const names = parsed.doc.items.flatMap((i) => [i.id, i.name, i.summary]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SCORECARD_VIEW_KEY", KEY);
  cookieValue.current = undefined;
  getScorecard.mockResolvedValue(data);
});

describe("the /packages page is private", () => {
  it("does not exist when the deployment has no view key, and reads nothing", async () => {
    vi.stubEnv("SCORECARD_VIEW_KEY", "");
    cookieValue.current = makeViewCookie(KEY);
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getScorecard).not.toHaveBeenCalled();
  });

  it.each([
    ["no cookie", undefined],
    ["a wrong cookie", "123.abc"],
    ["a cookie made with another key", makeViewCookie("another-key")],
    ["an expired cookie", makeViewCookie(KEY, Date.now() - 31 * 24 * 3600 * 1000)],
  ])("shows only the key form with %s, and never touches the data", async (_label, cookie) => {
    cookieValue.current = cookie;
    const html = await render();
    expect(html).toContain('data-testid="key-form"');
    expect(html).toContain('action="/packages/session"');
    expect(getScorecard).not.toHaveBeenCalled();
    for (const text of names) expect(html).not.toContain(text);
    expect(html).not.toContain("average overall");
    expect(html).not.toContain("Sign out");
  });

  it("says a key was not accepted after a wrong one, in the same words whatever was wrong", async () => {
    expect(await render({ denied: "1" })).toContain("That key was not accepted.");
    expect(await render()).not.toContain("not accepted");
  });

  it("draws the scorecard, and a Sign out button, for a valid cookie", async () => {
    cookieValue.current = makeViewCookie(KEY);
    const html = await render();
    expect(getScorecard).toHaveBeenCalledTimes(1);
    expect(html).toContain("Package scorecard");
    expect(html).toContain("Sign out");
    expect(html).toContain('value="signout"');
    expect(html).toContain("kazoku-ui");
    expect(html).not.toContain('data-testid="key-form"');
  });

  it("stays noindex and dynamic", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(dynamic).toBe("force-dynamic");
  });
});
