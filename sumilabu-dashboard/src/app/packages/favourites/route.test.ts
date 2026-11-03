import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COOKIE_NAME, TEST_ADMINS, TEST_SECRET, sessionToken } from "@/lib/auth/testSession";
import { parseScorecard } from "@/lib/scorecard/contract";
import sample from "@/lib/scorecard/fixtures/sample.json";

const { getScorecard, store } = vi.hoisted(() => ({ getScorecard: vi.fn(), store: { value: [] as string[], saves: 0, reads: 0 } }));
vi.mock("@/lib/scorecard/data", () => ({ getScorecard }));
vi.mock("@/lib/scorecard/favourites-store", () => ({
  loadFavouritesFresh: async () => {
    store.reads++;
    return store.value;
  },
  saveFavourites: async (ids: string[]) => {
    store.saves++;
    store.value = [...ids];
  },
}));

const parsed = parseScorecard(sample);
if (!parsed.ok) throw new Error("sample must parse");
const { POST } = await import("./route");

const HOST = "localhost:6510";
async function post(body: unknown, { cookie = true, origin = `http://${HOST}`, type = "application/json" }: { cookie?: boolean | string; origin?: string | null; type?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, "content-type": type };
  if (origin) headers.origin = origin;
  if (cookie) headers.cookie = `${COOKIE_NAME}=${typeof cookie === "string" ? cookie : await sessionToken("john@spxis.com")}`;
  const res = await POST(new NextRequest(`http://${HOST}/packages/favourites`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", TEST_SECRET);
  vi.stubEnv("SUMILABU_ADMIN_EMAILS", TEST_ADMINS);
  vi.stubEnv("NEXTAUTH_URL", "");
  vi.stubEnv("VERCEL", "");
  getScorecard.mockResolvedValue({ doc: parsed.doc, receivedAt: "", trend: [] });
  store.value = [];
  store.saves = 0;
  store.reads = 0;
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /packages/favourites", () => {
  it("adds and removes a heart, answering with the list as stored", async () => {
    expect(await post({ id: "chizu", on: true })).toEqual({ status: 200, body: { ok: true, favourites: ["chizu"] } });
    expect(await post({ id: "kazoku-ui", on: true })).toEqual({ status: 200, body: { ok: true, favourites: ["chizu", "kazoku-ui"] } });
    expect(await post({ id: "chizu", on: false })).toEqual({ status: 200, body: { ok: true, favourites: ["kazoku-ui"] } });
    expect(store.value).toEqual(["kazoku-ui"]);
  });

  it.each([
    ["no session", { cookie: false }],
    ["a forged cookie", { cookie: "forged" }],
  ])("refuses %s, and reads and writes nothing", async (_label, opts) => {
    expect((await post({ id: "chizu", on: true }, opts)).status).toBe(401);
    expect(store.reads + store.saves).toBe(0);
    expect(getScorecard).not.toHaveBeenCalled();
  });

  it("refuses a session for an address not on the list", async () => {
    expect((await post({ id: "chizu", on: true }, { cookie: await sessionToken("stranger@gmail.com") })).status).toBe(401);
    expect(store.saves).toBe(0);
  });

  it.each([
    ["from another site", "https://evil.example"],
    ["with no Origin", null],
  ])("refuses a write %s even with John's session", async (_label, origin) => {
    const res = await post({ id: "chizu", on: true }, { origin });
    expect(res).toEqual({ status: 403, body: { ok: false, error: "cross_origin" } });
    expect(store.reads + store.saves).toBe(0);
  });

  it("refuses a form post (not JSON), which a page elsewhere could send without asking", async () => {
    expect((await post("id=chizu&on=true", { type: "application/x-www-form-urlencoded" })).status).toBe(415);
  });

  it("refuses an id that is not in the current run", async () => {
    expect(await post({ id: "not-a-package", on: true })).toEqual({ status: 404, body: { ok: false, error: "unknown_item" } });
    expect(store.saves).toBe(0);
  });

  it("refuses a body that is not exactly { id, on }", async () => {
    for (const body of ["{", { id: "chizu" }, { id: "chizu", on: 1 }, ["chizu"]]) expect((await post(body)).status).toBe(400);
    expect((await post({ id: "chizu", on: true, pad: "x".repeat(600) })).status).toBe(413);
  });

  it("has no GET: the page reads the hearts in its own render", async () => {
    expect(await import("./route")).not.toHaveProperty("GET");
  });
});
