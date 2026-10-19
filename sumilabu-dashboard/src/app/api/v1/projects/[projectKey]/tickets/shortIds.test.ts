import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BoardTicketView } from "@/lib/board/server";
import { prisma } from "@/lib/prisma";

import { GET as getOne, PATCH } from "./[ticketId]/route";
import { POST as shipRoute } from "./[ticketId]/ship/route";
import { POST as bulkRoute } from "./bulk/route";
import { POST as importRoute } from "./import/route";
import { GET as list, POST as createRoute } from "./route";

/*
 * Invariant 14: a ticket's short id. Called as Next calls the routes, against
 * the in-memory board (memoryPrisma.ts), whose transaction lock stands in for
 * Postgres's row lock. The real-database run (a scratch Postgres, with a
 * dump of real rows) is in the change's report, not here.
 *
 * Each test gets two projects of its own, so one test's counters never leak
 * into the next; the prefix of `sid-3-a` is `SID-3-A`.
 */
vi.mock("@/lib/prisma", async () => {
  const { memoryPrisma } = await import("@/lib/board/memoryPrisma");
  return { prisma: memoryPrisma() };
});

const TOKEN = "test-board-token";
let n = 0;
let A = "";
let B = "";

type Body = { ok: boolean; error?: string; problems?: string[]; ticket?: BoardTicketView; tickets?: BoardTicketView[]; imported?: number; results?: { id: string; ok: boolean; ticket?: BoardTicketView }[] };

function request(method: string, path: string, body?: unknown, actor: string | null = "short-builder") {
  const headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` };
  if (actor) headers["x-board-actor"] = actor;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost/api/v1/projects/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function read(response: Response): Promise<{ status: number; json: Body }> {
  return { status: response.status, json: (await response.json()) as Body };
}
const inProject = (projectKey: string) => ({ params: Promise.resolve({ projectKey }) });
const onTicket = (projectKey: string, ticketId: string) => ({ params: Promise.resolve({ projectKey, ticketId }) });

const create = async (project: string, title = "A ticket with a short id") => read(await createRoute(request("POST", `${project}/tickets`, { title }), inProject(project)));
const get = async (project: string, id: string) => read(await getOne(request("GET", `${project}/tickets/${id}`), onTicket(project, id)));
const patch = async (project: string, id: string, body: unknown) => read(await PATCH(request("PATCH", `${project}/tickets/${id}`, body), onTicket(project, id)));
const all = async (project: string) => read(await list(request("GET", `${project}/tickets`), inProject(project)));

/** A row as it was before the column existed: no seq, and a creation time of the test's choosing. */
async function legacyRow(project: string, id: string, createdAt: string, extra: Record<string, unknown> = {}) {
  await prisma.boardTicket.create({
    data: { id: `${project}:${id}`, projectKey: project, title: `Legacy ticket ${id} row`, kind: "feature", status: "open", createdAt: new Date(createdAt), movedAt: new Date(createdAt), ...extra },
  });
}

beforeEach(() => {
  n += 1;
  A = `sid-${n}-a`;
  B = `sid-${n}-b`;
  vi.stubEnv("BOARD_TOKENS_JSON", JSON.stringify({ [A]: TOKEN, [B]: TOKEN, "spx-stats": TOKEN }));
});

describe("assigning numbers", () => {
  it("numbers a project's tickets 1, 2, 3 from its prefix, and keeps the cuid as the id", async () => {
    const first = (await create(A)).json.ticket!;
    const second = (await create(A)).json.ticket!;
    expect([first.seq, second.seq]).toEqual([1, 2]);
    expect(first.shortId).toBe(`${A.toUpperCase()}-1`);
    expect(second.shortId).toBe(`${A.toUpperCase()}-2`);
    expect(first.id).not.toBe(first.shortId);
    expect(first.id).toBeTruthy();
  });

  it("gives each project its own counter", async () => {
    await create(A);
    await create(A);
    const other = (await create(B)).json.ticket!;
    expect(other.seq).toBe(1);
    expect(other.shortId).toBe(`${B.toUpperCase()}-1`);
  });

  it("calls spx-stats SPX, as AGENTS.md promises", async () => {
    const made = (await create("spx-stats")).json.ticket!;
    expect(made.shortId).toMatch(/^SPX-\d+$/);
  });

  it("never reuses a number, not for a dropped ticket and not for a deleted newest one", async () => {
    const one = (await create(A)).json.ticket!;
    const two = (await create(A)).json.ticket!;
    expect((await patch(A, two.id, { status: "dropped" })).status).toBe(200);
    expect((await create(A)).json.ticket!.seq).toBe(3);
    await prisma.boardTicket.deleteMany({ where: { projectKey: A, seq: 3 } });
    expect((await create(A)).json.ticket!.seq).toBe(4);
    expect(one.seq).toBe(1);
  });

  it("does not collide when many creates run at once", async () => {
    const made = await Promise.all(Array.from({ length: 12 }, () => create(A)));
    expect(made.every((m) => m.status === 201)).toBe(true);
    const seqs = made.map((m) => m.json.ticket!.seq!).sort((x, y) => x - y);
    expect(seqs).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });

  it("gives a refused create its number back", async () => {
    await createRoute(request("POST", `${A}/tickets`, { title: "First with a key", key: "same-key" }), inProject(A));
    const refused = await read(await createRoute(request("POST", `${A}/tickets`, { title: "Second with that key", key: "same-key" }), inProject(A)));
    expect(refused.status).toBe(409);
    expect((await create(A)).json.ticket!.seq).toBe(2);
  });
});

describe("resolving an id", () => {
  it("takes the short id in either case, and the cuid, on every route", async () => {
    const made = (await create(A)).json.ticket!;
    const short = made.shortId!;
    for (const id of [short, short.toLowerCase(), made.id]) {
      const found = await get(A, id);
      expect(found.status, id).toBe(200);
      expect(found.json.ticket!.id).toBe(made.id);
    }
    const claimed = await patch(A, short.toLowerCase(), { status: "inProgress" });
    expect(claimed.status).toBe(200);
    expect(claimed.json.ticket!.claimedBy).toBe("short-builder");
    const shipped = await read(await shipRoute(request("POST", `${A}/tickets/${short}/ship`, { version: "abc1234" }), onTicket(A, short)));
    expect(shipped.status).toBe(200);
    expect(shipped.json.ticket!.status).toBe("done");
    expect((await get(A, made.id)).json.ticket!.releasedIn).toBe("abc1234");
  });

  it("takes short ids in a bulk update", async () => {
    const one = (await create(A)).json.ticket!;
    const two = (await create(A)).json.ticket!;
    const out = await read(await bulkRoute(request("POST", `${A}/tickets/bulk`, { updates: [{ id: one.shortId, priority: "high" }, { id: two.id, priority: "low" }] }), inProject(A)));
    expect(out.json.results!.map((r) => r.ok)).toEqual([true, true]);
    expect(out.json.results![0].ticket!.priority).toBe("high");
    expect(out.json.results![1].ticket!.id).toBe(two.id);
  });

  it("answers 404 for another project's prefix and for a number nobody has", async () => {
    const inA = (await create(A)).json.ticket!;
    await create(B);
    /* A's SID-n-a-1 in B must not find B's own number 1. */
    expect((await get(B, inA.shortId!)).status).toBe(404);
    expect((await patch(B, inA.shortId!, { status: "inProgress" })).status).toBe(404);
    expect((await get(A, `${A.toUpperCase()}-99`)).status).toBe(404);
    expect((await get(A, inA.id)).status).toBe(200);
    expect((await get(B, inA.id)).status).toBe(404);
  });

  it("does not read 0142, +1, 1.5 or a bare number as short ids", async () => {
    await create(A);
    for (const bad of [`${A}-01`, `${A}-+1`, `${A}-1.5`, `${A}-`, "1"]) expect((await get(A, bad)).status, bad).toBe(404);
  });

  it("keeps working for an id a client imported, even one that looks like a short id of another project", async () => {
    const odd = `${B.toUpperCase()}-7`;
    const out = await read(await importRoute(request("POST", `${A}/tickets/import`, { tickets: [{ id: odd, title: "Imported under a strange id", kind: "feature", status: "open", createdAt: "2026-09-01T00:00:00.000Z", movedAt: "2026-09-01T00:00:00.000Z" }] }), inProject(A)));
    expect(out.status).toBe(200);
    expect((await get(A, odd)).json.ticket!.id).toBe(odd);
  });
});

describe("backfilling rows that predate the column", () => {
  it("numbers them in creation order, id breaking a tie, the first time anything asks", async () => {
    await legacyRow(A, "legacy-c", "2026-09-03T00:00:00.000Z");
    await legacyRow(A, "legacy-b2", "2026-09-02T00:00:00.000Z");
    await legacyRow(A, "legacy-b1", "2026-09-02T00:00:00.000Z");
    await legacyRow(A, "legacy-a", "2026-09-01T00:00:00.000Z");
    const listed = (await all(A)).json.tickets!;
    const bySeq = Object.fromEntries(listed.map((t) => [t.id.split(":")[1], t.seq]));
    expect(bySeq).toEqual({ "legacy-a": 1, "legacy-b1": 2, "legacy-b2": 3, "legacy-c": 4 });
    expect(listed.every((t) => t.shortId === `${A.toUpperCase()}-${t.seq}`)).toBe(true);
  });

  it("is a no-op the second time, and a new ticket gets max + 1", async () => {
    await legacyRow(A, "legacy-1", "2026-09-01T00:00:00.000Z");
    await legacyRow(A, "legacy-2", "2026-09-02T00:00:00.000Z");
    await all(A);
    const snapshot = async () => (await prisma.boardTicket.findMany({ where: { projectKey: A } })).map((r) => JSON.stringify(r)).sort();
    const before = await snapshot();
    await all(A);
    await get(A, `${A.toUpperCase()}-2`);
    expect(await snapshot()).toEqual(before);
    expect((await create(A)).json.ticket!.seq).toBe(3);
  });

  it("resolves a short id on a project nothing has numbered yet", async () => {
    await legacyRow(A, "legacy-1", "2026-09-01T00:00:00.000Z");
    await legacyRow(A, "legacy-2", "2026-09-02T00:00:00.000Z");
    const found = await get(A, `${A.toUpperCase()}-2`);
    expect(found.status).toBe(200);
    expect(found.json.ticket!.id).toBe(`${A}:legacy-2`);
  });

  it("numbers legacy rows before a create takes its number, so the create is last", async () => {
    await legacyRow(A, "legacy-1", "2026-09-01T00:00:00.000Z");
    await legacyRow(A, "legacy-2", "2026-09-02T00:00:00.000Z");
    expect((await create(A)).json.ticket!.seq).toBe(3);
    expect((await get(A, `${A}:legacy-1`)).json.ticket!.seq).toBe(1);
  });

  it("numbers the rows an import brings over, after the ones already numbered", async () => {
    await create(A);
    const rows = ["z-later", "a-earlier"].map((id, i) => ({
      id: `${A}:${id}`,
      title: `Imported ${id} ticket`,
      kind: "feature",
      status: "open",
      createdAt: `2026-08-0${2 - i}T00:00:00.000Z`,
      movedAt: "2026-08-03T00:00:00.000Z",
    }));
    const out = await read(await importRoute(request("POST", `${A}/tickets/import`, { tickets: rows }), inProject(A)));
    expect(out.json.imported).toBe(2);
    expect((await get(A, `${A}:a-earlier`)).json.ticket!.seq).toBe(2);
    expect((await get(A, `${A}:z-later`)).json.ticket!.seq).toBe(3);
  });

  it("does not move updatedAt when it numbers a row", async () => {
    await legacyRow(A, "legacy-1", "2026-09-01T00:00:00.000Z", { updatedAt: new Date("2026-09-05T00:00:00.000Z") });
    await all(A);
    const row = await prisma.boardTicket.findFirst({ where: { id: `${A}:legacy-1` } });
    expect((row!.updatedAt as Date).toISOString()).toBe("2026-09-05T00:00:00.000Z");
  });
});
