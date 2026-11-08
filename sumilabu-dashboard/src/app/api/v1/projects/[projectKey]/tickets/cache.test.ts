import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { nextCacheStandIn } from "@/lib/board/memoryCache";
import { LEASE_MS } from "@/lib/board/rules";
import type { BoardTicketView } from "@/lib/board/server";
import { boardTag } from "@/lib/board/ticketCache";
import { prisma } from "@/lib/prisma";

import { GET as getOne, PATCH } from "./[ticketId]/route";
import { POST as shipRoute } from "./[ticketId]/ship/route";
import { POST as bulkRoute } from "./bulk/route";
import { GET as list, POST as createRoute } from "./route";

/*
 * SUMILABU-15: what a board read costs. Every call the routes make on the
 * database is counted (a Proxy over the in-memory board, one count per
 * model call or transaction), and Next's data cache is the stand-in that
 * keeps its contract (`memoryCache.ts`). The budgets asserted here:
 *
 *   - a list, a ticket or a key read asked with its ETag, nothing changed:
 *     0 queries, a 304 and no body;
 *   - the same read without an ETag: at most 2 queries (the board's version
 *     when it is not cached, then the read itself); one ticket's read by id
 *     or short id also reads its family and its links (SUMILABU-20), so up to
 *     4, and none of them grows with the size of the board;
 *   - a write clears exactly its own board's version, never another's, and
 *     the data cache holds one small entry per board (one 8 KB write unit);
 *   - a lease running out changes the ETag with no write and no query;
 *   - no token is ever part of a cache key, a cached value or an ETag.
 */
const queries = vi.hoisted(() => ({ count: 0 }));

vi.mock("next/cache", async () => (await import("@/lib/board/memoryCache")).memoryCache());
vi.mock("@/lib/prisma", async () => {
  const { memoryPrisma } = await import("@/lib/board/memoryPrisma");
  const counted = <T extends object>(target: T): T =>
    new Proxy(target, {
      get(object, property, receiver) {
        const value = Reflect.get(object, property, receiver);
        if (typeof value === "function") {
          return (...args: unknown[]) => {
            queries.count += 1;
            return (value as (...a: unknown[]) => unknown).apply(object, args);
          };
        }
        return value !== null && typeof value === "object" ? counted(value as object) : value;
      },
    });
  return { prisma: counted(memoryPrisma()) };
});

const TOKEN = "board-cache-test-token-ITS";
const OTHER_TOKEN = "board-cache-test-token-UK";
const ITS = "itsutsu-dev";
const UK = "umakuma-dev";

type Body = { ok: boolean; error?: string; ticket?: BoardTicketView; tickets?: BoardTicketView[] };

function request(method: string, path: string, opts: { body?: unknown; token?: string; etag?: string | null; actor?: string } = {}) {
  const headers: Record<string, string> = { authorization: `Bearer ${opts.token ?? TOKEN}`, "x-board-actor": opts.actor ?? "cache-test" };
  if (opts.etag) headers["if-none-match"] = opts.etag;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost/api/v1/projects/${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

const inProject = (projectKey: string) => ({ params: Promise.resolve({ projectKey }) });
const onTicket = (projectKey: string, ticketId: string) => ({ params: Promise.resolve({ projectKey, ticketId }) });

async function listOf(projectKey: string, query = "", opts: { etag?: string | null; token?: string } = {}) {
  const response = await list(request("GET", `${projectKey}/tickets${query}`, { ...opts, token: opts.token ?? (projectKey === UK ? OTHER_TOKEN : TOKEN) }), inProject(projectKey));
  const text = await response.text();
  return { status: response.status, etag: response.headers.get("etag"), text, json: (text ? JSON.parse(text) : null) as Body | null };
}

async function create(projectKey: string, title: string, key?: string) {
  const response = await createRoute(
    request("POST", `${projectKey}/tickets`, { body: { title, ...(key ? { key } : {}) }, token: projectKey === UK ? OTHER_TOKEN : TOKEN }),
    inProject(projectKey),
  );
  return ((await response.json()) as Body).ticket!;
}

/** Runs `step` and returns how many database calls it made. */
async function cost(step: () => Promise<unknown>): Promise<number> {
  const before = queries.count;
  await step();
  return queries.count - before;
}

beforeEach(async () => {
  vi.stubEnv("BOARD_TOKENS_JSON", JSON.stringify({ [ITS]: TOKEN, [UK]: OTHER_TOKEN }));
  await prisma.boardTicket.deleteMany({ where: { projectKey: { in: [ITS, UK] } } });
  nextCacheStandIn.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("an unchanged board costs no database query", () => {
  it("answers a list, a ticket by id or short id, and a key with 304 and no query while nothing changed", async () => {
    const ticket = await create(ITS, "Cache the board", "its-cache-board");
    const reads: [string, () => Promise<Response>][] = [
      ["list", () => list(request("GET", `${ITS}/tickets?unfinished=1`, { etag: tags.get("list") }), inProject(ITS))],
      ["all", () => list(request("GET", `${ITS}/tickets`, { etag: tags.get("all") }), inProject(ITS))],
      ["id", () => getOne(request("GET", `${ITS}/tickets/${ticket.id}`, { etag: tags.get("id") }), onTicket(ITS, ticket.id))],
      ["short", () => getOne(request("GET", `${ITS}/tickets/${ticket.shortId}`, { etag: tags.get("short") }), onTicket(ITS, ticket.shortId!))],
      ["key", () => list(request("GET", `${ITS}/tickets?key=its-cache-board`, { etag: tags.get("key") }), inProject(ITS))],
    ];
    const tags = new Map<string, string>();
    for (const [name, read] of reads) {
      let first: Response | undefined;
      expect(await cost(async () => (first = await read())), name).toBeLessThanOrEqual(name === "id" || name === "short" ? 4 : 2);
      expect(first!.status, name).toBe(200);
      tags.set(name, first!.headers.get("etag")!);
    }
    expect(new Set(tags.values()).size).toBe(reads.length);
    for (const [name, read] of reads) {
      let again: Response | undefined;
      expect(await cost(async () => (again = await read())), name).toBe(0);
      expect(again!.status, name).toBe(304);
      expect(await again!.text(), name).toBe("");
    }
  });

  it("matches a weak tag or one of a list, and answers 200 to another", async () => {
    await create(ITS, "Answer 304 when nothing changed");
    const first = await listOf(ITS, "?unfinished=1");
    expect(first.status).toBe(200);
    expect(first.etag).toMatch(/^"[A-Za-z0-9_-]{27}"$/);
    expect((await listOf(ITS, "?unfinished=1", { etag: `"other", W/${first.etag}` })).status).toBe(304);
    expect((await listOf(ITS, "?unfinished=1", { etag: '"not-this-one"' })).status).toBe(200);
    const again = await listOf(ITS, "?unfinished=1");
    expect(again.etag).toBe(first.etag);
  });

  it("still refuses a wrong token, before any query and with no ETag", async () => {
    await create(ITS, "Refuse a stranger");
    const first = await listOf(ITS);
    let stranger: Response | undefined;
    expect(await cost(async () => (stranger = await list(request("GET", `${ITS}/tickets`, { token: "wrong", etag: first.etag }), inProject(ITS))))).toBe(0);
    expect(stranger!.status).toBe(401);
    expect(stranger!.headers.get("etag")).toBeNull();
  });
});

describe("a write clears exactly its own board", () => {
  it("shows a create, a move, an edit, a grade and a ship on the next read, and leaves the other board cached", async () => {
    const mine = await create(ITS, "Move me about");
    await create(UK, "Leave me alone");
    const before = await listOf(ITS);
    const theirs = await listOf(UK);

    nextCacheStandIn.revalidated.length = 0;
    const claimed = await PATCH(
      request("PATCH", `${ITS}/tickets/${mine.id}`, { body: { status: "inProgress", priority: "high" } }),
      onTicket(ITS, mine.id),
    );
    expect(claimed.status).toBe(200);
    expect(new Set(nextCacheStandIn.revalidated)).toEqual(new Set([boardTag(ITS)]));

    const after = await listOf(ITS, "", { etag: before.etag });
    expect(after.status).toBe(200);
    expect(after.etag).not.toBe(before.etag);
    expect(after.json!.tickets![0]).toMatchObject({ status: "inProgress", claimedBy: "cache-test", heldNow: true, priority: "high" });

    expect(await cost(async () => expect((await listOf(UK, "", { etag: theirs.etag })).status).toBe(304))).toBe(0);

    const edited = await bulkRoute(request("POST", `${ITS}/tickets/bulk`, { body: { updates: [{ id: mine.id, title: "Moved about" }] } }), inProject(ITS));
    expect(edited.status).toBe(200);
    expect((await listOf(ITS)).json!.tickets![0].title).toBe("Moved about");

    const shipped = await shipRoute(request("POST", `${ITS}/tickets/${mine.id}/ship`, { body: { version: "1.2.3" } }), onTicket(ITS, mine.id));
    expect(shipped.status).toBe(200);
    expect((await listOf(ITS, "?unfinished=1")).json!.tickets).toEqual([]);
    const one = await getOne(request("GET", `${ITS}/tickets/${mine.id}`), onTicket(ITS, mine.id));
    expect(((await one.json()) as Body).ticket).toMatchObject({ status: "done", releasedIn: "1.2.3" });

    expect((await listOf(ITS, "?key=nothing-yet")).status).toBe(404);
    await create(ITS, "Now it exists", "nothing-yet");
    expect((await listOf(ITS, "?key=nothing-yet")).status).toBe(200);
  });

  it("does not clear the cache for a write that changed nothing", async () => {
    const mine = await create(ITS, "Hold this ticket for a while");
    await PATCH(request("PATCH", `${ITS}/tickets/${mine.id}`, { body: { status: "inProgress" }, actor: "first" }), onTicket(ITS, mine.id));
    const before = await listOf(ITS);
    nextCacheStandIn.revalidated.length = 0;
    const refused = await PATCH(request("PATCH", `${ITS}/tickets/${mine.id}`, { body: { status: "open" }, actor: "second" }), onTicket(ITS, mine.id));
    expect(refused.status).toBe(409);
    expect(nextCacheStandIn.revalidated).toEqual([]);
    expect(await cost(async () => expect((await listOf(ITS, "", { etag: before.etag })).status).toBe(304))).toBe(0);
  });
});

describe("the clock, not the cache, decides a hold (invariant 3)", () => {
  it("shows a lapsed lease as stale and changes the ETag, with no write and only the read itself", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-03T08:00:00.000Z"));
    const mine = await create(ITS, "Lapse my lease");
    await PATCH(request("PATCH", `${ITS}/tickets/${mine.id}`, { body: { status: "inProgress" } }), onTicket(ITS, mine.id));
    const held = await listOf(ITS);
    expect(held.json!.tickets![0].heldNow).toBe(true);

    vi.setSystemTime(new Date(Date.parse("2026-11-03T08:00:00.000Z") + LEASE_MS + 60_000));
    let lapsed: Awaited<ReturnType<typeof listOf>> | undefined;
    nextCacheStandIn.revalidated.length = 0;
    expect(await cost(async () => (lapsed = await listOf(ITS, "", { etag: held.etag })))).toBe(1);
    expect(nextCacheStandIn.revalidated).toEqual([]);
    expect(lapsed!.status).toBe(200);
    expect(lapsed!.etag).not.toBe(held.etag);
    expect(lapsed!.json!.tickets![0]).toMatchObject({ status: "inProgress", heldNow: false });
  });
});

describe("what the data cache holds", () => {
  it("is one entry per board, under one 8 KB write unit even with forty tickets held", async () => {
    for (let n = 0; n < 40; n += 1) {
      const t = await create(ITS, `Held ticket number ${n + 1}`);
      await PATCH(request("PATCH", `${ITS}/tickets/${t.id}`, { body: { status: "inProgress" } }), onTicket(ITS, t.id));
    }
    await create(UK, "A board of its own");
    await listOf(ITS);
    await listOf(ITS, "?unfinished=1");
    await listOf(ITS, "?status=open,inProgress");
    await listOf(UK);
    expect(nextCacheStandIn.entries.size).toBe(2);
    for (const entry of nextCacheStandIn.entries.values()) expect(entry.json.length).toBeLessThan(8 * 1024);
  });
});

describe("tokens stay out of the cache", () => {
  it("never puts a token in a cache key, a cached value or an ETag", async () => {
    const mine = await create(ITS, "Keep the key out");
    await create(UK, "Keep the other key out");
    await listOf(ITS);
    await listOf(ITS, "?unfinished=1");
    await listOf(UK);
    await getOne(request("GET", `${ITS}/tickets/${mine.id}`), onTicket(ITS, mine.id));
    expect(nextCacheStandIn.entries.size).toBeGreaterThan(0);
    for (const [key, entry] of nextCacheStandIn.entries) {
      for (const secret of [TOKEN, OTHER_TOKEN, "Bearer"]) {
        expect(key).not.toContain(secret);
        expect(entry.json).not.toContain(secret);
        expect(entry.tags.join(",")).not.toContain(secret);
      }
    }
    const a = await listOf(ITS);
    expect(a.etag).not.toContain(TOKEN.slice(0, 8));
  });
});
