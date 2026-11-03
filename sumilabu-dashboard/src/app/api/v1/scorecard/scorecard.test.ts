/* eslint-disable @typescript-eslint/no-explicit-any -- these tests push invalid values into a copy of a typed document on purpose */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import sample from "@/lib/scorecard/fixtures/sample.json";

const { upsert, findMany, deleteMany, revalidateTag } = vi.hoisted(() => ({
  upsert: vi.fn(),
  findMany: vi.fn(),
  deleteMany: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidateTag, unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/prisma", () => ({ prisma: { scorecardRun: { upsert, findMany, deleteMany } } }));

const { POST, MAX_BODY_BYTES } = await import("./route");

const TOKEN = "test-scorecard-token";

function post(body: string, headers: Record<string, string> = {}, token: string | null = TOKEN) {
  const h: Record<string, string> = { "content-type": "application/json", ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  return new NextRequest("http://localhost/api/v1/scorecard", { method: "POST", headers: h, body });
}

const valid = () => JSON.stringify(sample);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SCORECARD_TOKEN", TOKEN);
  upsert.mockResolvedValue({});
  findMany.mockResolvedValue([]);
  deleteMany.mockResolvedValue({ count: 0 });
});

const touchedNothing = () => {
  expect(upsert).not.toHaveBeenCalled();
  expect(revalidateTag).not.toHaveBeenCalled();
};

describe("POST /api/v1/scorecard", () => {
  it("401s with no key, a wrong key, or a key of another length, and reads nothing", async () => {
    for (const token of [null, "wrong", `${TOKEN}x`, ""]) {
      const res = await POST(post(valid(), {}, token));
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe("unauthorized");
    }
    touchedNothing();
  });

  it("401s when the deployment has no SCORECARD_TOKEN at all: no key means no door", async () => {
    vi.stubEnv("SCORECARD_TOKEN", "");
    const res = await POST(post(valid(), {}, ""));
    expect(res.status).toBe(401);
    const res2 = await POST(post(valid(), {}, TOKEN));
    expect(res2.status).toBe(401);
    touchedNothing();
  });

  it("does not accept a board, settings or reports key in its place", async () => {
    vi.stubEnv("BOARD_TOKENS_JSON", JSON.stringify({ umakuma: "board-key" }));
    const res = await POST(post(valid(), {}, "board-key"));
    expect(res.status).toBe(401);
    touchedNothing();
  });

  it("413s on a declared size over the limit, before reading the body", async () => {
    const res = await POST(post("{}", { "content-length": String(MAX_BODY_BYTES + 1) }));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe("too_large");
    touchedNothing();
  });

  it("413s on a body over the limit even when it declared nothing honest", async () => {
    const res = await POST(post(JSON.stringify({ pad: "x".repeat(MAX_BODY_BYTES) })));
    expect(res.status).toBe(413);
    touchedNothing();
  });

  it("400s on text that is not JSON", async () => {
    const res = await POST(post("{ not json"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_json");
    touchedNothing();
  });

  it("422s on JSON that breaks the contract, naming what is wrong", async () => {
    const bad = structuredClone(sample) as Record<string, any>;
    bad.items[0].kind = "service";
    bad.items[1].links.repo = "javascript:alert(1)";
    const res = await POST(post(JSON.stringify(bad)));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("invalid_payload");
    expect(body.problems.join("\n")).toContain("items.0.kind");
    expect(body.problems.join("\n")).toContain("items.1.links.repo");
    touchedNothing();
  });

  it("422s on a run dated more than a day ahead, which would sit as the latest for good", async () => {
    const future = structuredClone(sample) as Record<string, any>;
    future.generatedAt = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
    const res = await POST(post(JSON.stringify(future)));
    expect(res.status).toBe(422);
    touchedNothing();
  });

  it("stores a good run keyed by its generation time, then clears the page cache", async () => {
    const res = await POST(post(valid()));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, generatedAt: "2026-11-02T23:00:00Z", items: 10, pruned: 0 });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(upsert).toHaveBeenCalledTimes(1);
    const args = upsert.mock.calls[0][0];
    expect(args.where.generatedAt).toEqual(new Date("2026-11-02T23:00:00Z"));
    expect(args.create.itemCount).toBe(10);
    expect(args.create.overall["kazoku-ui"]).toBe(8);
    expect(revalidateTag).toHaveBeenCalledWith("scorecard", { expire: 0 });
  });

  it("removes runs past the newest ten", async () => {
    findMany.mockResolvedValue([{ id: "old1" }, { id: "old2" }]);
    const res = await POST(post(valid()));
    expect((await res.json()).pruned).toBe(2);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10 }));
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["old1", "old2"] } } });
  });

  it("answers 503 and leaves the cache alone when the database is down", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    upsert.mockRejectedValue(new Error("connection refused"));
    const res = await POST(post(valid()));
    expect(res.status).toBe(503);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
