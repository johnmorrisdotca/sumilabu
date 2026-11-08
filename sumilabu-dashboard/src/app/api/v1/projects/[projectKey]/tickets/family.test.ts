import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { nextCacheStandIn } from "@/lib/board/memoryCache";
import type { BoardTicketDetailView } from "@/lib/board/server";
import { prisma } from "@/lib/prisma";

import { POST as linkRoute } from "./[ticketId]/links/route";
import { DELETE as unlinkRoute } from "./[ticketId]/links/[otherId]/route";
import { GET as historyRoute } from "./[ticketId]/history/route";
import { GET as getOne, PATCH } from "./[ticketId]/route";
import { POST as shipRoute } from "./[ticketId]/ship/route";
import { POST as bulkRoute } from "./bulk/route";
import { GET as list, POST as createRoute } from "./route";

/*
 * Invariant 17 (a ticket's parent) and invariant 18 (related links), against
 * the in-memory board (memoryPrisma.ts), whose transactions run one at a time
 * as the project lock makes a parent change do in Postgres.
 */
vi.mock("next/cache", async () => (await import("@/lib/board/memoryCache")).memoryCache());
vi.mock("@/lib/prisma", async () => {
  const { memoryPrisma } = await import("@/lib/board/memoryPrisma");
  return { prisma: memoryPrisma() };
});

const TOKEN = "test-board-token";
const ITS = "itsutsu-dev";
const UK = "umakuma-dev";

type Body = {
  ok: boolean;
  error?: string;
  problems?: string[];
  ticket?: BoardTicketDetailView;
  tickets?: BoardTicketDetailView[];
  created?: boolean;
  removed?: boolean;
  related?: string[];
  results?: { id: string; ok: boolean; error?: string }[];
};

function request(method: string, path: string, opts: { body?: unknown; actor?: string | null; etag?: string | null } = {}) {
  const headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` };
  const actor = opts.actor === undefined ? "its-builder" : opts.actor;
  if (actor) headers["x-board-actor"] = actor;
  if (opts.etag) headers["if-none-match"] = opts.etag;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost/api/v1/projects/${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}

async function read(response: Response) {
  const text = await response.text();
  return { status: response.status, etag: response.headers.get("etag"), json: (text ? JSON.parse(text) : null) as Body };
}

const inProject = (projectKey: string) => ({ params: Promise.resolve({ projectKey }) });
const onTicket = (projectKey: string, ticketId: string) => ({ params: Promise.resolve({ projectKey, ticketId }) });

let made = 0;
const create = async (projectKey: string, title = `A ticket to group number ${++made}`) =>
  (await read(await createRoute(request("POST", `${projectKey}/tickets`, { body: { title } }), inProject(projectKey)))).json.ticket!;
const get = async (projectKey: string, id: string, etag: string | null = null) =>
  read(await getOne(request("GET", `${projectKey}/tickets/${id}`, { etag }), onTicket(projectKey, id)));
const patch = async (projectKey: string, id: string, body: unknown, actor: string | null = "its-builder") =>
  read(await PATCH(request("PATCH", `${projectKey}/tickets/${id}`, { body, actor }), onTicket(projectKey, id)));
const link = async (projectKey: string, id: string, otherId: unknown, actor: string | null = "its-builder") =>
  read(await linkRoute(request("POST", `${projectKey}/tickets/${id}/links`, { body: { otherId }, actor }), onTicket(projectKey, id)));
const unlink = async (projectKey: string, id: string, otherId: string, actor: string | null = "its-builder") =>
  read(await unlinkRoute(request("DELETE", `${projectKey}/tickets/${id}/links/${otherId}`, { actor }), { params: Promise.resolve({ projectKey, ticketId: id, otherId }) }));
const ship = async (projectKey: string, id: string) =>
  read(await shipRoute(request("POST", `${projectKey}/tickets/${id}/ship`, { body: { version: "1.0.0" } }), onTicket(projectKey, id)));
const family = async (projectKey: string, id: string) => {
  const { parent, children, related } = (await get(projectKey, id)).json.ticket!;
  return { parent, children, related };
};

beforeEach(async () => {
  nextCacheStandIn.clear();
  vi.stubEnv("BOARD_TOKENS_JSON", JSON.stringify({ [ITS]: TOKEN, [UK]: TOKEN }));
  await prisma.boardTicket.deleteMany({ where: { projectKey: { in: [ITS, UK] } } });
});

describe("a ticket's parent (invariant 17)", () => {
  it("is set by short id or cuid, shown on both tickets as short ids, and cleared with null", async () => {
    const parent = await create(ITS);
    const one = await create(ITS);
    const two = await create(ITS);

    const set = await patch(ITS, one.id, { parentId: parent.shortId });
    expect(set.status).toBe(200);
    expect(set.json.ticket).toMatchObject({ parentId: parent.id });
    expect((await patch(ITS, two.shortId!, { parentId: parent.id })).status).toBe(200);

    expect(await family(ITS, one.id)).toEqual({ parent: parent.shortId, children: [], related: [] });
    expect(await family(ITS, parent.shortId!.toLowerCase())).toEqual({ parent: null, children: [one.shortId, two.shortId], related: [] });
    const listed = (await read(await list(request("GET", `${ITS}/tickets`), inProject(ITS)))).json.tickets!;
    expect(listed.map((t) => [t.shortId, t.parentId])).toEqual(
      expect.arrayContaining([[parent.shortId, null], [one.shortId, parent.id], [two.shortId, parent.id]]),
    );

    const cleared = await patch(ITS, one.id, { parentId: null });
    expect(cleared.status).toBe(200);
    expect(cleared.json.ticket!.parentId).toBeNull();
    expect(await family(ITS, parent.id)).toMatchObject({ children: [two.shortId] });
  });

  it("moves a ticket between parents, and a ticket may sit under a done parent", async () => {
    const first = await create(ITS);
    const second = await create(ITS);
    const child = await create(ITS);
    await patch(ITS, child.id, { parentId: first.id });
    await patch(ITS, child.id, { parentId: second.id });
    expect((await family(ITS, first.id)).children).toEqual([]);
    expect((await family(ITS, second.id)).children).toEqual([child.shortId]);

    expect((await ship(ITS, first.id)).status).toBe(200);
    const under = await create(ITS);
    expect((await patch(ITS, under.id, { parentId: first.id })).status).toBe(200);
  });

  it("refuses itself, a child, a grandchild and a loop of two, 422, and writes nothing", async () => {
    const a = await create(ITS);
    const b = await create(ITS);
    const c = await create(ITS);
    await patch(ITS, b.id, { parentId: a.id });
    await patch(ITS, c.id, { parentId: b.id });

    for (const [id, parentId] of [[a.id, a.id], [a.id, b.id], [a.id, c.id], [b.id, c.id]] as const) {
      const refused = await patch(ITS, id, { parentId });
      expect(refused.status, `${id} under ${parentId}`).toBe(422);
      expect(refused.json.error).toBe(refused.json.problems![0]);
    }
    expect((await patch(ITS, a.id, { parentId: a.shortId })).json.problems).toEqual(["A ticket cannot be its own parent."]);
    expect((await patch(ITS, a.id, { parentId: c.id })).json.problems).toEqual(["The parent is below this ticket; a ticket cannot sit under its own child."]);
    expect(await family(ITS, a.id)).toEqual({ parent: null, children: [b.shortId], related: [] });
    expect(await family(ITS, b.id)).toMatchObject({ parent: a.shortId, children: [c.shortId] });
  });

  it("refuses two requests that would close a loop between them: one lands, one is 422", async () => {
    const a = await create(ITS);
    const b = await create(ITS);
    const results = await Promise.all([patch(ITS, a.id, { parentId: b.id }), patch(ITS, b.id, { parentId: a.id })]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 422]);
    const landed = [(await family(ITS, a.id)).parent, (await family(ITS, b.id)).parent].filter(Boolean);
    expect(landed).toHaveLength(1);
  });

  it("refuses a ticket that is not this project's, 422, by cuid or by the other project's short id", async () => {
    const mine = await create(ITS);
    const theirs = await create(UK);
    for (const parentId of [theirs.id, theirs.shortId!, "no-such-ticket", "ITSUTSU-DEV-999"]) {
      const refused = await patch(ITS, mine.id, { parentId });
      expect(refused.status, parentId).toBe(422);
      expect(refused.json.problems).toEqual(["The parent must be a ticket in this project."]);
    }
    expect((await get(ITS, mine.id)).json.ticket!.parentId).toBeNull();
  });

  it("refuses a parent change on a done row, 409 done, set or cleared, whatever it names", async () => {
    const parent = await create(ITS);
    const done = await create(ITS);
    await patch(ITS, done.id, { parentId: parent.id });
    expect((await ship(ITS, done.id)).status).toBe(200);

    for (const parentId of [null, parent.id, done.id, "no-such-ticket"]) {
      const refused = await patch(ITS, done.id, { parentId });
      expect(refused.status, String(parentId)).toBe(409);
      expect(refused.json.error).toBe("done");
    }
    expect(await family(ITS, done.id)).toMatchObject({ parent: parent.shortId });
    expect((await prisma.boardTicket.findFirst({ where: { id: done.id } }))!.editedBy).toBeNull();
  });

  it("rides with a move or a revision: a refused parent moves and revises nothing, and a good one lands with them", async () => {
    const a = await create(ITS);
    const b = await create(ITS);
    await patch(ITS, b.id, { parentId: a.id });

    const refused = await patch(ITS, a.id, { status: "inProgress", title: "Renamed while taken", parentId: b.id });
    expect(refused.status).toBe(422);
    expect(await prisma.boardTicket.findFirst({ where: { id: a.id } })).toMatchObject({ status: "open", claimedBy: null, title: a.title });

    const c = await create(ITS);
    const both = await patch(ITS, c.id, { status: "inProgress", title: "Taken and filed under a", parentId: a.shortId });
    expect(both.status).toBe(200);
    expect(both.json.ticket).toMatchObject({ status: "inProgress", claimedBy: "its-builder", title: "Taken and filed under a", parentId: a.id });
    expect((await historyRoute(request("GET", `${ITS}/tickets/${c.id}/history`), onTicket(ITS, c.id)).then(read)).json).toMatchObject({
      edits: [{ field: "title" }],
    });
  });

  it("is not a revision of the words: movedAt, editedBy and history stay, and an actor is needed", async () => {
    const parent = await create(ITS);
    const child = await create(ITS);
    expect((await patch(ITS, child.id, { parentId: parent.id }, null)).json.error).toBe("actor_required");
    const set = await patch(ITS, child.id, { parentId: parent.id }, "its-alex");
    expect(set.json.ticket).toMatchObject({ editedBy: null, editedAt: null, movedAt: child.movedAt, status: "open" });
    expect((await read(await historyRoute(request("GET", `${ITS}/tickets/${child.id}/history`), onTicket(ITS, child.id)))).json).toMatchObject({ edits: [] });
  });

  it("is set by a bulk row too, with the same refusals", async () => {
    const a = await create(ITS);
    const b = await create(ITS);
    const bulk = await read(
      await bulkRoute(
        request("POST", `${ITS}/tickets/bulk`, { body: { updates: [{ id: b.id, parentId: a.shortId }, { id: a.id, parentId: b.id }] } }),
        inProject(ITS),
      ),
    );
    expect(bulk.json.results!.map((r) => [r.ok, r.error])).toEqual([[true, undefined], [false, "The parent is below this ticket; a ticket cannot sit under its own child."]]);
    expect(await family(ITS, a.id)).toMatchObject({ children: [b.shortId] });
  });

  it("is refused as a payload when it is not a string or null", async () => {
    const a = await create(ITS);
    for (const parentId of [5, "", ["x"]]) expect((await patch(ITS, a.id, { parentId })).status).toBe(400);
  });
});

describe("related links (invariant 18)", () => {
  it("links two tickets by short id or cuid, reads from both ends, and is one link whichever end adds it", async () => {
    const a = await create(ITS);
    const b = await create(ITS);
    const first = await link(ITS, a.id, b.shortId);
    expect(first.status).toBe(201);
    expect(first.json).toMatchObject({ ok: true, created: true, related: [b.shortId] });

    const again = await link(ITS, b.shortId!.toLowerCase(), a.id);
    expect(again.status).toBe(200);
    expect(again.json).toMatchObject({ created: false, related: [a.shortId] });

    expect((await family(ITS, a.id)).related).toEqual([b.shortId]);
    expect((await family(ITS, b.id)).related).toEqual([a.shortId]);
    const rows = await prisma.boardTicketLink.findMany({ where: { projectKey: ITS } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ lowId: [a.id, b.id].sort()[0], highId: [a.id, b.id].sort()[1], by: "its-builder" });
  });

  it("lists several in the order of their numbers, and removes from either end", async () => {
    const [a, b, c] = [await create(ITS), await create(ITS), await create(ITS)];
    await link(ITS, a.id, c.id);
    await link(ITS, a.id, b.id);
    expect((await family(ITS, a.id)).related).toEqual([b.shortId, c.shortId]);

    const removed = await unlink(ITS, b.id, a.shortId!);
    expect(removed.status).toBe(200);
    expect(removed.json).toMatchObject({ removed: true, related: [] });
    expect((await family(ITS, a.id)).related).toEqual([c.shortId]);
    expect((await unlink(ITS, a.id, c.id)).json.removed).toBe(true);
    expect((await family(ITS, c.id)).related).toEqual([]);
  });

  it("treats a link that is not there as already removed, not an error", async () => {
    const [a, b] = [await create(ITS), await create(ITS)];
    const gone = await unlink(ITS, a.id, b.id);
    expect(gone.status).toBe(200);
    expect(gone.json).toMatchObject({ ok: true, removed: false });
    expect((await unlink(ITS, a.id, "no-such-ticket")).json.removed).toBe(false);
    expect((await unlink(ITS, "no-such-ticket", b.id)).status).toBe(404);
  });

  it("refuses itself, a ticket nobody holds, and another project's ticket, 422", async () => {
    const mine = await create(ITS);
    const theirs = await create(UK);
    const self = await link(ITS, mine.id, mine.shortId);
    expect(self.status).toBe(422);
    expect(self.json.problems).toEqual(["A ticket cannot be linked to itself."]);
    for (const other of [theirs.id, theirs.shortId, "no-such-ticket", "ITSUTSU-DEV-999"]) {
      const refused = await link(ITS, mine.id, other);
      expect(refused.status, String(other)).toBe(422);
      expect(refused.json.problems).toEqual(["The linked ticket must be a ticket in this project."]);
    }
    expect(await prisma.boardTicketLink.count({})).toBe(0);
    expect((await link(UK, mine.id, theirs.id)).status).toBe(404);
    expect((await link(ITS, "no-such-ticket", mine.id)).status).toBe(404);
    expect((await link(ITS, mine.id, 5)).status).toBe(400);
  });

  it("is allowed on a done row, for adding and for removing, and leaves the release record as it was", async () => {
    const done = await create(ITS);
    const open = await create(ITS);
    const shipped = (await ship(ITS, done.id)).json.ticket!;
    expect((await link(ITS, done.id, open.id)).status).toBe(201);
    expect((await link(ITS, open.id, done.id)).json.created).toBe(false);
    expect((await family(ITS, done.id)).related).toEqual([open.shortId]);
    expect(await prisma.boardTicket.findFirst({ where: { id: done.id } })).toMatchObject({
      status: "done",
      releasedIn: "1.0.0",
      title: shipped.title,
      editedBy: null,
      movedAt: new Date(shipped.movedAt),
    });
    expect((await unlink(ITS, done.id, open.id)).json.removed).toBe(true);
  });

  it("needs an actor to add or remove", async () => {
    const [a, b] = [await create(ITS), await create(ITS)];
    expect((await link(ITS, a.id, b.id, null)).json.error).toBe("actor_required");
    await link(ITS, a.id, b.id);
    expect((await unlink(ITS, a.id, b.id, null)).json.error).toBe("actor_required");
    expect((await family(ITS, a.id)).related).toEqual([b.shortId]);
  });
});

describe("the ETag never leaves a parent or a link unseen (SUMILABU-15)", () => {
  it("answers 200 on both tickets after a parent is set, cleared or changed, and 304 when nothing changed", async () => {
    const parent = await create(ITS);
    const child = await create(ITS);
    const parentTag = (await get(ITS, parent.id)).etag!;
    const childTag = (await get(ITS, child.id)).etag!;
    expect((await get(ITS, parent.id, parentTag)).status).toBe(304);

    await patch(ITS, child.id, { parentId: parent.id });
    const parentAfter = await get(ITS, parent.id, parentTag);
    expect(parentAfter.status).toBe(200);
    expect(parentAfter.json.ticket!.children).toEqual([child.shortId]);
    expect((await get(ITS, child.id, childTag)).json.ticket!.parent).toBe(parent.shortId);
    expect((await get(ITS, parent.id, parentAfter.etag)).status).toBe(304);

    await patch(ITS, child.id, { parentId: null });
    const cleared = await get(ITS, parent.id, parentAfter.etag);
    expect(cleared.status).toBe(200);
    expect(cleared.json.ticket!.children).toEqual([]);
  });

  it("answers 200 on both tickets after a link is added or removed, and 304 when the add was a repeat", async () => {
    const a = await create(ITS);
    const b = await create(ITS);
    const aTag = (await get(ITS, a.id)).etag!;
    const bTag = (await get(ITS, b.shortId!)).etag!;

    await link(ITS, a.id, b.id);
    const aAfter = await get(ITS, a.id, aTag);
    expect(aAfter.status).toBe(200);
    expect(aAfter.json.ticket!.related).toEqual([b.shortId]);
    expect((await get(ITS, b.shortId!, bTag)).json.ticket!.related).toEqual([a.shortId]);

    nextCacheStandIn.revalidated.length = 0;
    await link(ITS, b.id, a.id);
    expect(nextCacheStandIn.revalidated).toEqual([]);
    expect((await get(ITS, a.id, aAfter.etag)).status).toBe(304);

    await unlink(ITS, a.id, b.id);
    const removed = await get(ITS, a.id, aAfter.etag);
    expect(removed.status).toBe(200);
    expect(removed.json.ticket!.related).toEqual([]);
  });

  it("clears only its own board's version for a link", async () => {
    const a = await create(ITS);
    const b = await create(ITS);
    nextCacheStandIn.revalidated.length = 0;
    await link(ITS, a.id, b.id);
    expect(new Set(nextCacheStandIn.revalidated)).toEqual(new Set(["board-tickets:itsutsu-dev"]));
  });
});
