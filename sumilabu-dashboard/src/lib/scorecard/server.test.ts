import { beforeEach, describe, expect, it, vi } from "vitest";

import sample from "./fixtures/sample.json";

const { findMany, findUnique } = vi.hoisted(() => ({ findMany: vi.fn(), findUnique: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { scorecardRun: { findMany, findUnique } } }));

const { readScorecard } = await import("./server");

const run = (id: string, generatedAt: string, overall: Record<string, number | null>) => ({
  id,
  generatedAt: new Date(generatedAt),
  receivedAt: new Date("2026-11-03T00:00:00Z"),
  overall,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("readScorecard", () => {
  it("is null, with one query, when nothing was ever uploaded", async () => {
    findMany.mockResolvedValue([]);
    expect(await readScorecard()).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("loads only the newest run's document and gives the trend oldest first", async () => {
    findMany.mockResolvedValue([
      run("r3", "2026-11-02T23:00:00Z", { "kazoku-ui": 8 }),
      run("r2", "2026-10-26T23:00:00Z", { "kazoku-ui": 7 }),
      run("r1", "2026-10-19T23:00:00Z", { "kazoku-ui": null }),
    ]);
    findUnique.mockResolvedValue({ payload: sample });
    const data = await readScorecard();
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "r3" }, select: { payload: true } });
    expect(data?.doc.items).toHaveLength(10);
    expect(data?.trend.map((t) => t.generatedAt)).toEqual(["2026-10-19T23:00:00.000Z", "2026-10-26T23:00:00.000Z", "2026-11-02T23:00:00.000Z"]);
    expect(data?.receivedAt).toBe("2026-11-03T00:00:00.000Z");
  });

  it("selects only the small columns for the older runs, never every payload", async () => {
    findMany.mockResolvedValue([run("r1", "2026-11-02T23:00:00Z", {})]);
    findUnique.mockResolvedValue({ payload: sample });
    await readScorecard();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ select: { id: true, generatedAt: true, receivedAt: true, overall: true } }));
  });

  it("is null, not a crash, when the stored document no longer passes the contract", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    findMany.mockResolvedValue([run("r1", "2026-11-02T23:00:00Z", {})]);
    findUnique.mockResolvedValue({ payload: { schemaVersion: 9 } });
    expect(await readScorecard()).toBeNull();
  });
});
