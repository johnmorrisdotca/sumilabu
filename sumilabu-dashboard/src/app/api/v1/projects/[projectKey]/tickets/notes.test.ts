import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { nextCacheStandIn } from "@/lib/board/memoryCache";
import type { EditView, NoteView } from "@/lib/board/notes";
import { TICKET_LIMITS } from "@/lib/board/rules";
import type { BoardTicketView } from "@/lib/board/server";
import { prisma } from "@/lib/prisma";

import { GET as historyRoute } from "./[ticketId]/history/route";
import { GET as notesRoute, POST as addNoteRoute } from "./[ticketId]/notes/route";
import { PATCH } from "./[ticketId]/route";
import { POST as shipRoute } from "./[ticketId]/ship/route";
import { POST as bulkRoute } from "./bulk/route";
import { POST as createRoute } from "./route";

/*
 * Invariant 15 (edit history) and invariant 16 (notes), against the in-memory
 * board (memoryPrisma.ts), whose transaction rolls back whole on a throw as
 * Postgres's does.
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
  ticket?: BoardTicketView;
  note?: NoteView;
  notes?: NoteView[];
  edits?: EditView[];
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

const create = async (projectKey: string, body: Record<string, unknown>) =>
  (await read(await createRoute(request("POST", `${projectKey}/tickets`, { body }), inProject(projectKey)))).json.ticket!;
const patch = async (projectKey: string, id: string, body: unknown, actor: string | null = "its-builder") =>
  read(await PATCH(request("PATCH", `${projectKey}/tickets/${id}`, { body, actor }), onTicket(projectKey, id)));
const addNote = async (projectKey: string, id: string, body: unknown, actor: string | null = "its-builder") =>
  read(await addNoteRoute(request("POST", `${projectKey}/tickets/${id}/notes`, { body, actor }), onTicket(projectKey, id)));
const notes = async (projectKey: string, id: string, etag: string | null = null) =>
  read(await notesRoute(request("GET", `${projectKey}/tickets/${id}/notes`, { etag }), onTicket(projectKey, id)));
const history = async (projectKey: string, id: string, etag: string | null = null) =>
  read(await historyRoute(request("GET", `${projectKey}/tickets/${id}/history`, { etag }), onTicket(projectKey, id)));

beforeEach(async () => {
  nextCacheStandIn.clear();
  vi.stubEnv("BOARD_TOKENS_JSON", JSON.stringify({ [ITS]: TOKEN, [UK]: TOKEN }));
  await prisma.boardTicket.deleteMany({ where: { projectKey: { in: [ITS, UK] } } });
});

describe("notes (invariant 16)", () => {
  it("appends in order, trimmed, with who and when, and reads oldest first", async () => {
    const ticket = await create(ITS, { title: "Show a player's XP history" });
    const first = await addNote(ITS, ticket.id, { body: "  First finding  " }, "its-alex");
    expect(first.status).toBe(201);
    expect(first.json.note).toMatchObject({ ticketId: ticket.id, body: "First finding", by: "its-alex" });
    expect(Number.isNaN(Date.parse(first.json.note!.createdAt))).toBe(false);
    await addNote(ITS, ticket.id, { body: "Second finding" }, "its-sam");

    const listed = await notes(ITS, ticket.id);
    expect(listed.status).toBe(200);
    expect(listed.json.notes!.map((n) => [n.body, n.by])).toEqual([["First finding", "its-alex"], ["Second finding", "its-sam"]]);
    expect((await notes(ITS, ticket.shortId!)).json.notes).toHaveLength(2);
    expect((await notes(ITS, ticket.shortId!.toLowerCase())).json.notes).toHaveLength(2);
  });

  it("takes exactly 16,000 characters and refuses 16,001, an empty note and a note of spaces", async () => {
    expect(TICKET_LIMITS.note).toBe(16000);
    const ticket = await create(ITS, { title: "Show a player's XP history" });
    expect((await addNote(ITS, ticket.id, { body: "n".repeat(16000) })).status).toBe(201);
    const over = await addNote(ITS, ticket.id, { body: "n".repeat(16001) });
    expect(over.status).toBe(422);
    expect(over.json.problems).toEqual(["A note is at most 16,000 characters."]);
    for (const body of ["", "   \n  "]) {
      const refused = await addNote(ITS, ticket.id, { body });
      expect(refused.status).toBe(422);
      expect(refused.json.problems).toEqual(["A note needs at least one character that is not a space."]);
    }
    expect((await addNote(ITS, ticket.id, { body: "n".repeat(64001) })).status).toBe(400);
    expect((await addNote(ITS, ticket.id, { text: "wrong field" })).status).toBe(400);
    expect((await notes(ITS, ticket.id)).json.notes).toHaveLength(1);
  });

  it("is allowed on every status, a done ticket included, and leaves the done row as it was", async () => {
    const ticket = await create(ITS, { title: "Show a player's XP history", detail: "Shipped words" });
    const shipped = await shipRoute(request("POST", `${ITS}/tickets/${ticket.id}/ship`, { body: { version: "1.2.3" } }), onTicket(ITS, ticket.id));
    expect(shipped.status).toBe(200);
    const done = (await read(shipped)).json.ticket!;

    const noted = await addNote(ITS, ticket.id, { body: "Found after the release" });
    expect(noted.status).toBe(201);
    expect(await prisma.boardTicket.findFirst({ where: { id: ticket.id } })).toMatchObject({
      status: "done",
      title: done.title,
      detail: "Shipped words",
      releasedIn: "1.2.3",
      editedBy: null,
    });

    const dropped = await create(ITS, { title: "Something we said no to" });
    await patch(ITS, dropped.id, { status: "dropped" });
    expect((await addNote(ITS, dropped.id, { body: "Why not" })).status).toBe(201);
  });

  it("needs a token and an actor, and finds only this project's tickets", async () => {
    const ticket = await create(ITS, { title: "Show a player's XP history" });
    expect((await addNote(ITS, ticket.id, { body: "No name" }, null)).json.error).toBe("actor_required");
    const stranger = await addNoteRoute(
      new NextRequest(`http://localhost/api/v1/projects/${ITS}/tickets/${ticket.id}/notes`, {
        method: "POST",
        headers: { authorization: "Bearer wrong", "x-board-actor": "x", "content-type": "application/json" },
        body: JSON.stringify({ body: "Hello" }),
      }),
      onTicket(ITS, ticket.id),
    );
    expect(stranger.status).toBe(401);

    expect((await addNote(UK, ticket.id, { body: "Wrong board" })).status).toBe(404);
    expect((await notes(UK, ticket.id)).status).toBe(404);
    expect((await addNote(ITS, "no-such-ticket", { body: "Nobody home" })).status).toBe(404);
    expect((await addNote(ITS, "UMAKUMA-DEV-1", { body: "Other prefix" })).status).toBe(404);
    expect((await notes(ITS, ticket.id)).json.notes).toEqual([]);
  });

  it("is not part of the ticket's words: a note changes no edit history and no revision stamp", async () => {
    const ticket = await create(ITS, { title: "Show a player's XP history" });
    await addNote(ITS, ticket.id, { body: "A note" });
    expect((await history(ITS, ticket.id)).json.edits).toEqual([]);
    expect(await prisma.boardTicket.findFirst({ where: { id: ticket.id } })).toMatchObject({ editedBy: null, editedAt: null });
  });
});

describe("edit history (invariant 15)", () => {
  it("keeps the old and new title and detail, who and when, oldest first", async () => {
    const ticket = await create(ITS, { title: "Show a player's XP history", detail: "First words" });
    expect((await patch(ITS, ticket.id, { title: "  A clearer title for the same work  ", detail: "Second words" }, "its-alex")).status).toBe(200);
    expect((await patch(ITS, ticket.id, { detail: "Third words" }, "its-sam")).status).toBe(200);

    const listed = await history(ITS, ticket.id);
    expect(listed.status).toBe(200);
    expect(listed.json.edits!.map((e) => [e.field, e.oldValue, e.newValue, e.editedBy])).toEqual([
      ["title", "Show a player's XP history", "A clearer title for the same work", "its-alex"],
      ["detail", "First words", "Second words", "its-alex"],
      ["detail", "Second words", "Third words", "its-sam"],
    ]);
    expect(Number.isNaN(Date.parse(listed.json.edits![0].editedAt))).toBe(false);
    expect((await history(ITS, ticket.shortId!)).json.edits).toHaveLength(3);
  });

  it("writes a row only for a field that changed, and none for a grade, a bare move or the same words again", async () => {
    const ticket = await create(ITS, { title: "Show a player's XP history", detail: "Same words" });
    await patch(ITS, ticket.id, { priority: "high", effort: "small" });
    await patch(ITS, ticket.id, { status: "inProgress" });
    await patch(ITS, ticket.id, { title: "Show a player's XP history", detail: "Same words", area: "xp" });
    await patch(ITS, ticket.id, { title: "  Show a player's XP history  " });
    expect((await history(ITS, ticket.id)).json.edits).toEqual([]);

    await patch(ITS, ticket.id, { detail: "Different words" });
    expect((await history(ITS, ticket.id)).json.edits!.map((e) => e.field)).toEqual(["detail"]);
  });

  it("keeps a cleared detail as a null, a title carried by a move, and a bulk row", async () => {
    const ticket = await create(ITS, { title: "Show a player's XP history", detail: "Words to clear" });
    await patch(ITS, ticket.id, { detail: "" });
    const moved = await patch(ITS, ticket.id, { status: "inProgress", title: "Taken and renamed at once" });
    expect(moved.status).toBe(200);
    const bulk = await bulkRoute(
      request("POST", `${ITS}/tickets/bulk`, { body: { updates: [{ id: ticket.shortId, detail: "Written in bulk" }] } }),
      inProject(ITS),
    );
    expect(bulk.status).toBe(200);
    expect((await history(ITS, ticket.id)).json.edits!.map((e) => [e.field, e.oldValue, e.newValue])).toEqual([
      ["detail", "Words to clear", null],
      ["title", "Show a player's XP history", "Taken and renamed at once"],
      ["detail", null, "Written in bulk"],
    ]);
  });

  it("holds 16,000 characters of detail on each side", async () => {
    const ticket = await create(ITS, { title: "Show a player's XP history", detail: "a".repeat(16000) });
    await patch(ITS, ticket.id, { detail: "b".repeat(16000) });
    const [edit] = (await history(ITS, ticket.id)).json.edits!;
    expect([edit.oldValue!.length, edit.newValue!.length]).toEqual([16000, 16000]);
  });

  it("writes nothing for a refused revision: a done row, a held row, a cap", async () => {
    const done = await create(ITS, { title: "Show a player's XP history", detail: "Shipped words" });
    await shipRoute(request("POST", `${ITS}/tickets/${done.id}/ship`, { body: { version: "1.0.0" } }), onTicket(ITS, done.id));
    const refusedDone = await patch(ITS, done.id, { title: "Rewording a shipped release", detail: "Rewritten" });
    expect(refusedDone.status).toBe(409);
    expect(refusedDone.json.error).toBe("done");

    const held = await create(ITS, { title: "Held by somebody else", detail: "Held words" });
    await patch(ITS, held.id, { status: "inProgress" }, "its-first");
    const refusedHeld = await patch(ITS, held.id, { status: "open", detail: "Taken over" }, "its-second");
    expect(refusedHeld.status).toBe(409);

    const capped = await create(ITS, { title: "Over the cap", detail: "Capped words" });
    expect((await patch(ITS, capped.id, { detail: "d".repeat(TICKET_LIMITS.detail + 1) })).status).toBe(422);

    for (const id of [done.id, held.id, capped.id]) expect((await history(ITS, id)).json.edits).toEqual([]);
    expect(await prisma.boardTicket.findFirst({ where: { id: held.id } })).toMatchObject({ detail: "Held words" });
  });

  it("is written in the same transaction: a history row that fails takes the revision with it", async () => {
    const ticket = await create(ITS, { title: "Show a player's XP history", detail: "Before" });
    const failing = vi.spyOn(prisma.boardTicketEdit, "create").mockRejectedValueOnce(new Error("disk full"));
    await expect(patch(ITS, ticket.id, { title: "A title that must not stick", detail: "After" })).rejects.toThrow("disk full");
    failing.mockRestore();

    expect(await prisma.boardTicket.findFirst({ where: { id: ticket.id } })).toMatchObject({
      title: "Show a player's XP history",
      detail: "Before",
      editedBy: null,
      editedAt: null,
    });
    expect((await history(ITS, ticket.id)).json.edits).toEqual([]);
  });

  it("answers 404 for a ticket that is not this project's, and needs the token", async () => {
    const ticket = await create(ITS, { title: "Show a player's XP history" });
    expect((await history(UK, ticket.id)).status).toBe(404);
    expect((await history(ITS, "no-such-ticket")).status).toBe(404);
  });
});

describe("the ETag never leaves a note or an edit unseen (SUMILABU-15)", () => {
  it("answers 304 while nothing changed and 200 with the new note after one is added", async () => {
    const ticket = await create(ITS, { title: "Show a player's XP history" });
    const first = await notes(ITS, ticket.id);
    expect(first.etag).toMatch(/^"[A-Za-z0-9_-]{27}"$/);
    expect((await notes(ITS, ticket.id, first.etag)).status).toBe(304);

    await addNote(ITS, ticket.id, { body: "Something new" });
    const after = await notes(ITS, ticket.id, first.etag);
    expect(after.status).toBe(200);
    expect(after.etag).not.toBe(first.etag);
    expect(after.json.notes!.map((n) => n.body)).toEqual(["Something new"]);
    expect((await notes(ITS, ticket.id, after.etag)).status).toBe(304);
  });

  it("answers 200 with the new edit after a PATCH changed the words, and 304 after one that did not", async () => {
    const ticket = await create(ITS, { title: "Show a player's XP history", detail: "Before" });
    const first = await history(ITS, ticket.id);
    expect((await history(ITS, ticket.id, first.etag)).status).toBe(304);

    await patch(ITS, ticket.id, { detail: "After" });
    const after = await history(ITS, ticket.id, first.etag);
    expect(after.status).toBe(200);
    expect(after.json.edits).toHaveLength(1);
    expect((await history(ITS, ticket.id, after.etag)).status).toBe(304);
  });

  it("keeps a tag of one ticket from standing in for another's, and a refused note leaves the version alone", async () => {
    const one = await create(ITS, { title: "Show a player's XP history" });
    const two = await create(ITS, { title: "Show a player's win streaks" });
    const tag = (await notes(ITS, one.id)).etag!;
    expect((await notes(ITS, two.id, tag)).status).toBe(200);

    nextCacheStandIn.revalidated.length = 0;
    await addNote(ITS, one.id, { body: "   " });
    expect(nextCacheStandIn.revalidated).toEqual([]);
    expect((await notes(ITS, one.id, tag)).status).toBe(304);
  });
});
