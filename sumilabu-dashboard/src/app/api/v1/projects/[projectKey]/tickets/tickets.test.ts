import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TICKET_LIMITS } from "@/lib/board/rules";
import type { BoardTicketView } from "@/lib/board/server";
import { prisma } from "@/lib/prisma";

import { GET as getOne, PATCH } from "./[ticketId]/route";
import { POST as shipRoute } from "./[ticketId]/ship/route";
import { POST as unshipRoute } from "./[ticketId]/unship/route";
import { POST as bulkRoute } from "./bulk/route";
import { POST as importRoute } from "./import/route";
import { GET as list, POST as createRoute } from "./route";

/*
 * The ticket routes, called as Next calls them, against an in-memory board
 * that keeps the schema's unique indexes (memoryPrisma.ts). Leave this mock
 * out and point DATABASE_URL and DIRECT_URL at a throwaway database to run
 * the same cases against Postgres. The projects are the dev ones, so even
 * that run never touches a real board.
 */
vi.mock("@/lib/prisma", async () => {
  const { memoryPrisma } = await import("@/lib/board/memoryPrisma");
  return { prisma: memoryPrisma() };
});

const TOKEN = "test-board-token";
const ITS = "itsutsu-dev";
const UK = "umakuma-dev";

type BulkResult = { id: string; ok: boolean; error?: string; problems?: string[]; heldBy?: string | null; ticket?: BoardTicketView };

type Body = {
  ok: boolean;
  error?: string;
  problems?: string[];
  ticketId?: string | null;
  imported?: number;
  ticket?: BoardTicketView;
  tickets?: BoardTicketView[];
  results?: BulkResult[];
};

function request(method: string, path: string, { body, actor = "its-builder" }: { body?: unknown; actor?: string | null } = {}) {
  const headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` };
  if (actor) headers["x-board-actor"] = actor;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost/api/v1/projects/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function read(response: Response): Promise<{ status: number; json: Body }> {
  return { status: response.status, json: (await response.json()) as Body };
}

const inProject = (projectKey: string) => ({ params: Promise.resolve({ projectKey }) });
const onTicket = (projectKey: string, ticketId: string) => ({ params: Promise.resolve({ projectKey, ticketId }) });

const create = async (projectKey: string, body: Record<string, unknown>) =>
  read(await createRoute(request("POST", `${projectKey}/tickets`, { body }), inProject(projectKey)));
const byKey = async (projectKey: string, query: string) =>
  read(await list(request("GET", `${projectKey}/tickets?${query}`), inProject(projectKey)));
const getTicket = async (projectKey: string, id: string) =>
  read(await getOne(request("GET", `${projectKey}/tickets/${id}`), onTicket(projectKey, id)));
const patch = async (projectKey: string, id: string, body: unknown, actor: string | null = "its-builder") =>
  read(await PATCH(request("PATCH", `${projectKey}/tickets/${id}`, { body, actor }), onTicket(projectKey, id)));
const importRows = async (projectKey: string, tickets: Record<string, unknown>[]) =>
  read(await importRoute(request("POST", `${projectKey}/tickets/import`, { body: { tickets } }), inProject(projectKey)));
const bulk = async (projectKey: string, updates: Record<string, unknown>[], actor: string | null = "its-builder") =>
  read(await bulkRoute(request("POST", `${projectKey}/tickets/bulk`, { body: { updates }, actor }), inProject(projectKey)));

function row(id: string, extra: Record<string, unknown> = {}) {
  return { id, title: "A ticket brought over", kind: "feature", status: "open", createdAt: "2026-09-01T00:00:00.000Z", movedAt: "2026-09-01T00:00:00.000Z", ...extra };
}

beforeEach(async () => {
  vi.stubEnv("BOARD_TOKENS_JSON", JSON.stringify({ [ITS]: TOKEN, [UK]: TOKEN }));
  await prisma.boardTicket.deleteMany({ where: { projectKey: { in: [ITS, UK] } } });
});

describe("a ticket key (invariant 11)", () => {
  it("keeps a valid key and returns it on every read", async () => {
    const made = await create(ITS, { title: "Show a player's XP history", key: "its-xp-history" });
    expect(made.status).toBe(201);
    const id = made.json.ticket!.id;
    expect(made.json.ticket!.key).toBe("its-xp-history");
    expect((await getTicket(ITS, id)).json.ticket!.key).toBe("its-xp-history");
    expect((await read(await list(request("GET", `${ITS}/tickets`), inProject(ITS)))).json.tickets!.map((t) => t.key)).toEqual(["its-xp-history"]);

    const longest = "k".repeat(TICKET_LIMITS.key);
    expect((await create(ITS, { title: "The longest key there is", key: longest })).json.ticket!.key).toBe(longest);
    expect((await create(ITS, { title: "A ticket cited by its id" })).json.ticket!.key).toBeNull();
  });

  it("refuses a key that is not a kebab slug, and writes nothing", async () => {
    for (const key of ["Its-xp", "its_xp", "its--xp", "-its-xp", "its-xp-", "its xp", "", "k".repeat(TICKET_LIMITS.key + 1)]) {
      const refused = await create(ITS, { title: "A ticket with a bad key", key });
      expect(refused.status, key).toBe(422);
      expect(refused.json.problems, key).toHaveLength(1);
    }
    expect((await read(await list(request("GET", `${ITS}/tickets`), inProject(ITS)))).json.tickets).toEqual([]);
  });

  it("refuses the same key twice in one project, naming the ticket that holds it", async () => {
    const first = await create(ITS, { title: "Show a player's XP history", key: "its-xp-history" });
    const second = await create(ITS, { title: "Another ticket wanting it", key: "its-xp-history" });
    expect(second.status).toBe(409);
    expect(second.json).toMatchObject({ ok: false, error: "key_taken", ticketId: first.json.ticket!.id });
  });

  it("allows the same key in another project, and any number of tickets with no key", async () => {
    expect((await create(ITS, { title: "Show a player's XP history", key: "its-xp-history" })).status).toBe(201);
    expect((await create(UK, { title: "The same name, elsewhere", key: "its-xp-history" })).status).toBe(201);
    expect((await create(ITS, { title: "A ticket cited by its id" })).status).toBe(201);
    expect((await create(ITS, { title: "Another cited by its id" })).status).toBe(201);
  });

  it("finds a ticket by key, only in its own project, and refuses a malformed or filtered lookup", async () => {
    const id = (await create(ITS, { title: "Show a player's XP history", key: "its-xp-history" })).json.ticket!.id;
    const found = await byKey(ITS, "key=its-xp-history");
    expect(found.status).toBe(200);
    expect(found.json).toMatchObject({ ok: true, ticket: { id, key: "its-xp-history" } });

    expect(await byKey(UK, "key=its-xp-history")).toMatchObject({ status: 404, json: { error: "missing" } });
    expect(await byKey(ITS, "key=nobody-has-this")).toMatchObject({ status: 404, json: { error: "missing" } });
    expect(await byKey(ITS, "key=Not_A_Key")).toMatchObject({ status: 400, json: { error: "invalid_key" } });
    expect(await byKey(ITS, "key=its-xp-history&status=open")).toMatchObject({ status: 400, json: { error: "key_with_filter" } });
  });

  it("never changes a key through PATCH", async () => {
    const id = (await create(ITS, { title: "Show a player's XP history", key: "its-xp-history" })).json.ticket!.id;
    expect(await patch(ITS, id, { key: "its-other-name", priority: "high" })).toMatchObject({ status: 400, json: { error: "key_immutable" } });
    expect((await getTicket(ITS, id)).json.ticket).toMatchObject({ key: "its-xp-history", priority: null });
  });
});

describe("importing keys (invariant 11)", () => {
  it("keeps a key, and a re-run that omits it keeps the stored one", async () => {
    expect(await importRows(ITS, [row("its-import-1", { key: "its-imported" })])).toMatchObject({ status: 200, json: { imported: 1 } });
    expect((await byKey(ITS, "key=its-imported")).json.ticket!.id).toBe("its-import-1");
    expect((await importRows(ITS, [row("its-import-1", { key: "its-imported" })])).status).toBe(200);
    expect((await importRows(ITS, [row("its-import-1")])).status).toBe(200);
    expect((await getTicket(ITS, "its-import-1")).json.ticket!.key).toBe("its-imported");
  });

  it("refuses a row whose key belongs to a different ticket, beside another project's id, and writes nothing", async () => {
    const holder = (await create(ITS, { title: "Holds the key already", key: "its-taken" })).json.ticket!.id;
    const foreign = (await create(UK, { title: "A ticket in another project" })).json.ticket!.id;
    const refused = await importRows(ITS, [row("its-import-2"), row("its-import-3", { key: "its-taken" }), row(foreign)]);
    expect(refused.status).toBe(422);
    expect(refused.json.problems).toEqual([
      `${foreign}: already belongs to project ${UK}.`,
      `its-import-3: the key its-taken belongs to ticket ${holder}; refused rather than overwritten.`,
    ]);
    expect(refused.json.error).toBe(refused.json.problems![0]);
    expect((await getTicket(ITS, "its-import-2")).status).toBe(404);
    expect((await getTicket(ITS, holder)).json.ticket!.key).toBe("its-taken");
  });

  it("refuses a row that would change a stored key, and two rows sharing one", async () => {
    expect((await importRows(ITS, [row("its-import-4", { key: "its-first" })])).status).toBe(200);
    expect((await importRows(ITS, [row("its-import-4", { key: "its-second" })])).json.problems).toEqual([
      "its-import-4: its key is its-first, and a key is never changed.",
    ]);
    const shared = await importRows(ITS, [row("its-import-5", { key: "its-shared" }), row("its-import-6", { key: "its-shared" })]);
    expect(shared.status).toBe(422);
    expect(shared.json.problems).toEqual(["its-import-6: the key its-shared is also on its-import-5 in this import."]);
  });
});

describe("revising a ticket's words (invariant 12)", () => {
  it("writes a title and detail within the caps, records the actor, and does not move the row", async () => {
    const made = (await create(ITS, { title: "Show a player's XP history", detail: "First words" })).json.ticket!;
    const detail = "d".repeat(TICKET_LIMITS.detail);
    const revised = await patch(ITS, made.id, { title: "  A clearer title for the same work  ", detail }, "its-editor");
    expect(revised.status).toBe(200);
    expect(revised.json.ticket).toMatchObject({ title: "A clearer title for the same work", detail, status: "open", editedBy: "its-editor", movedAt: made.movedAt });
    expect(revised.json.ticket!.editedAt).not.toBeNull();

    const longest = "t".repeat(TICKET_LIMITS.title);
    expect((await patch(ITS, made.id, { title: longest })).json.ticket!.title).toBe(longest);
    expect((await patch(ITS, made.id, { detail: null })).json.ticket!.detail).toBeNull();
  });

  it("combines with a move and a grade in one request", async () => {
    const id = (await create(ITS, { title: "Show a player's XP history" })).json.ticket!.id;
    const both = await patch(ITS, id, { status: "inProgress", title: "Taken and renamed at once", priority: "high" });
    expect(both.status).toBe(200);
    expect(both.json.ticket).toMatchObject({ status: "inProgress", claimedBy: "its-builder", title: "Taken and renamed at once", priority: "high", editedBy: "its-builder" });
  });

  it("refuses words past the caps, and writes nothing else the request carried", async () => {
    const id = (await create(ITS, { title: "Show a player's XP history" })).json.ticket!.id;
    for (const body of [
      { title: "t".repeat(TICKET_LIMITS.titleMin - 1) },
      { title: "t".repeat(TICKET_LIMITS.title + 1) },
      { detail: "d".repeat(TICKET_LIMITS.detail + 1) },
      { status: "inProgress", priority: "high", title: "t".repeat(TICKET_LIMITS.titleMin - 1) },
    ]) {
      const refused = await patch(ITS, id, body);
      expect(refused.status).toBe(422);
      expect(refused.json.error).toBe(refused.json.problems![0]);
    }
    expect((await getTicket(ITS, id)).json.ticket).toMatchObject({ title: "Show a player's XP history", status: "open", priority: null, editedBy: null });
  });

  it("needs an actor to revise, and a ticket that exists", async () => {
    const id = (await create(ITS, { title: "Show a player's XP history" })).json.ticket!.id;
    expect(await patch(ITS, id, { title: "Renamed by nobody at all" }, null)).toMatchObject({ status: 400, json: { error: "actor_required" } });
    expect((await patch(ITS, "no-such-ticket", { title: "Renamed into thin air" })).status).toBe(404);
  });

  it("refuses to revise a done ticket, and allows it again once the stamp is taken back", async () => {
    const id = (await create(ITS, { title: "Show a player's XP history" })).json.ticket!.id;
    const shipped = await read(await shipRoute(request("POST", `${ITS}/tickets/${id}/ship`, { body: { version: "0.196.0" } }), onTicket(ITS, id)));
    expect(shipped.json.ticket!.status).toBe("done");

    expect(await patch(ITS, id, { title: "Renamed after it shipped", priority: "low" })).toMatchObject({ status: 409, json: { error: "done" } });
    expect((await getTicket(ITS, id)).json.ticket).toMatchObject({ title: "Show a player's XP history", priority: null, editedBy: null });

    const reason = { reason: "The release never reached main." };
    expect((await read(await unshipRoute(request("POST", `${ITS}/tickets/${id}/unship`, { body: reason }), onTicket(ITS, id)))).status).toBe(200);
    expect((await patch(ITS, id, { title: "Renamed once it was reopened" })).status).toBe(200);
  });

  it("revises a dropped ticket, which may yet be reopened", async () => {
    const id = (await create(ITS, { title: "Show a player's XP history" })).json.ticket!.id;
    expect((await patch(ITS, id, { status: "dropped" })).json.ticket!.status).toBe("dropped");
    expect((await patch(ITS, id, { title: "Dropped, and worded better" })).json.ticket).toMatchObject({ status: "dropped", title: "Dropped, and worded better" });
  });

  it("revises area, askedBy and kind alongside title and detail, stamping the actor", async () => {
    const id = (await create(ITS, { title: "Show a player's XP history", area: "profile" })).json.ticket!.id;
    const revised = await patch(ITS, id, { area: "leaderboard", askedBy: "a player", kind: "fix" }, "its-editor");
    expect(revised.status).toBe(200);
    expect(revised.json.ticket).toMatchObject({ area: "leaderboard", askedBy: "a player", kind: "fix", editedBy: "its-editor" });

    expect((await patch(ITS, id, { area: null })).json.ticket!.area).toBeNull();
    expect((await patch(ITS, id, { askedBy: "  " })).json.ticket!.askedBy).toBeNull();
  });

  it("refuses an area or askedBy past its cap on revise, the same as on create", async () => {
    const id = (await create(ITS, { title: "Show a player's XP history", askedBy: "a player" })).json.ticket!.id;
    expect((await patch(ITS, id, { area: "a".repeat(TICKET_LIMITS.area + 1) })).status).toBe(422);
    expect((await patch(ITS, id, { askedBy: "a".repeat(TICKET_LIMITS.askedBy + 1) })).status).toBe(422);
    expect((await getTicket(ITS, id)).json.ticket).toMatchObject({ area: null, askedBy: "a player" });
  });
});

describe("moving a ticket through PATCH (invariant 1 and 4)", () => {
  it("refuses a move the table does not allow, without touching the row", async () => {
    const id = (await create(ITS, { title: "Show a player's XP history" })).json.ticket!.id;
    const refused = await patch(ITS, id, { status: "open" });
    expect(refused.status).toBe(409);
    expect(refused.json).toMatchObject({ error: "illegal" });
    expect((await getTicket(ITS, id)).json.ticket!.status).toBe("open");
  });

  it("refuses a move onto a ticket somebody else holds, naming who holds it", async () => {
    const id = (await create(ITS, { title: "Show a player's XP history" })).json.ticket!.id;
    await patch(ITS, id, { status: "inProgress" }, "its-first-claimer");
    const refused = await patch(ITS, id, { status: "dropped" }, "its-second-claimer");
    expect(refused.status).toBe(409);
    expect(refused.json).toMatchObject({ error: "held", heldBy: "its-first-claimer" });
    expect((await getTicket(ITS, id)).json.ticket).toMatchObject({ status: "inProgress", claimedBy: "its-first-claimer" });
  });

  it("lets the claim holder move its own ticket on, clearing the claim", async () => {
    const id = (await create(ITS, { title: "Show a player's XP history" })).json.ticket!.id;
    await patch(ITS, id, { status: "inProgress" }, "its-builder");
    const moved = await patch(ITS, id, { status: "dropped" }, "its-builder");
    expect(moved.status).toBe(200);
    expect(moved.json.ticket).toMatchObject({ status: "dropped", claimedBy: null, claimedAt: null });
  });
});

describe("bulk-patching tickets (tickets/bulk)", () => {
  it("moves and grades several tickets in one request, each independently", async () => {
    const a = (await create(ITS, { title: "First of a batch of tickets" })).json.ticket!.id;
    const b = (await create(ITS, { title: "Second of a batch of tickets" })).json.ticket!.id;
    const result = await bulk(ITS, [
      { id: a, status: "inProgress" },
      { id: b, priority: "high", effort: "small" },
    ]);
    expect(result.status).toBe(200);
    expect(result.json.results).toMatchObject([
      { id: a, ok: true, ticket: { status: "inProgress", claimedBy: "its-builder" } },
      { id: b, ok: true, ticket: { priority: "high", effort: "small" } },
    ]);
  });

  it("reports a missing id and a held ticket without failing the rest of the batch", async () => {
    const held = (await create(ITS, { title: "Claimed by somebody else" })).json.ticket!.id;
    await patch(ITS, held, { status: "inProgress" }, "its-first-claimer");
    const free = (await create(ITS, { title: "Nobody holds this one" })).json.ticket!.id;

    const result = await bulk(ITS, [
      { id: held, status: "dropped" },
      { id: "no-such-ticket", priority: "high" },
      { id: free, status: "dropped" },
    ], "its-second-claimer");
    expect(result.status).toBe(200);
    expect(result.json.results).toMatchObject([
      { id: held, ok: false, error: "held", heldBy: "its-first-claimer" },
      { id: "no-such-ticket", ok: false, error: "missing" },
      { id: free, ok: true, ticket: { status: "dropped" } },
    ]);
  });

  it("needs an actor only when a row moves or revises words, not for grading alone", async () => {
    const id = (await create(ITS, { title: "Graded without an actor" })).json.ticket!.id;
    expect(await bulk(ITS, [{ id, priority: "low" }], null)).toMatchObject({ status: 200 });
    expect(await bulk(ITS, [{ id, status: "inProgress" }], null)).toMatchObject({ status: 400, json: { error: "actor_required" } });
  });

  it("refuses a batch naming a key, and an empty or oversized batch", async () => {
    const id = (await create(ITS, { title: "A ticket for an oversized batch" })).json.ticket!.id;
    expect(await bulk(ITS, [{ id, key: "nope" }])).toMatchObject({ status: 400, json: { error: "key_immutable" } });
    expect((await bulk(ITS, [])).status).toBe(400);
    expect((await bulk(ITS, Array.from({ length: 101 }, () => ({ id, priority: "low" })))).status).toBe(400);
  });
});
