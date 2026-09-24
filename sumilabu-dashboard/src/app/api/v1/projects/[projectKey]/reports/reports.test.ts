import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReportView } from "@/lib/reports/server";
import { prisma } from "@/lib/prisma";

import { GET as getOne, PATCH, DELETE as del } from "./[id]/route";
import { POST as fileRoute } from "./[id]/file/route";
import { GET as imageRoute } from "./[id]/image/route";
import { POST as importRoute } from "./import/route";
import { GET as list, POST as createRoute } from "./route";

/*
 * The reports routes, called as Next calls them, against the in-memory
 * report + boardTicket store (reports/memoryPrisma.ts), which also exercises
 * the file route's transaction. Leave the mock out and point DATABASE_URL
 * and DIRECT_URL at a throwaway database to run the same cases against
 * Postgres; the projects are the -dev ones, so even that never touches a
 * real board.
 */
vi.mock("@/lib/prisma", async () => {
  const { memoryPrisma } = await import("@/lib/reports/memoryPrisma");
  return { prisma: memoryPrisma() };
});

const REPORTS_TOKEN = "test-reports-token";
const BOARD_TOKEN = "test-board-token";
const UK = "umakuma-dev";

type Body = {
  ok: boolean;
  error?: string;
  problems?: string[];
  scope?: string;
  limit?: string;
  imported?: number;
  report?: ReportView;
  reports?: ReportView[];
  ticketId?: string;
  deleted?: boolean;
};

function request(method: string, path: string, opts: { body?: unknown; actor?: string | null; token?: string } = {}) {
  const headers: Record<string, string> = { authorization: `Bearer ${opts.token ?? REPORTS_TOKEN}` };
  if (opts.actor) headers["x-board-actor"] = opts.actor;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost/api/v1/projects/${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

async function read(response: Response): Promise<{ status: number; json: Body }> {
  return { status: response.status, json: (await response.json()) as Body };
}

const inProject = (projectKey: string) => ({ params: Promise.resolve({ projectKey }) });
const onReport = (projectKey: string, id: string) => ({ params: Promise.resolve({ projectKey, id }) });

const create = async (projectKey: string, body: Record<string, unknown>) =>
  read(await createRoute(request("POST", `${projectKey}/reports`, { body }), inProject(projectKey)));
const listReports = async (projectKey: string, query = "") =>
  read(await list(request("GET", `${projectKey}/reports${query ? `?${query}` : ""}`), inProject(projectKey)));
const getReport = async (projectKey: string, id: string) =>
  read(await getOne(request("GET", `${projectKey}/reports/${id}`), onReport(projectKey, id)));
const patch = async (projectKey: string, id: string, body: unknown, actor: string | null = "admin-alex") =>
  read(await PATCH(request("PATCH", `${projectKey}/reports/${id}`, { body, actor }), onReport(projectKey, id)));
const remove = async (projectKey: string, id: string, actor: string | null = "admin-alex") =>
  read(await del(request("DELETE", `${projectKey}/reports/${id}`, { actor }), onReport(projectKey, id)));
const file = async (projectKey: string, id: string, body: Record<string, unknown> = {}, actor: string | null = "admin-alex") =>
  read(await fileRoute(request("POST", `${projectKey}/reports/${id}/file`, { body, actor, token: BOARD_TOKEN }), onReport(projectKey, id)));
const importRows = async (projectKey: string, reports: Record<string, unknown>[], actor: string | null = "migration") =>
  read(await importRoute(request("POST", `${projectKey}/reports/import`, { body: { reports }, actor }), inProject(projectKey)));

const draft = { body: "The map does not load on a phone.", reporterRef: "member-1" };

const image = async (projectKey: string, id: string, token = REPORTS_TOKEN) =>
  imageRoute(request("GET", `${projectKey}/reports/${id}/image`, { token }), onReport(projectKey, id));

/** A PNG by its signature, padded to `size` bytes, as the base64 a site sends. */
function png(size = 2048): string {
  const out = Buffer.alloc(size);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(out);
  return out.toString("base64");
}
const MIB = 1024 * 1024;

beforeEach(async () => {
  vi.stubEnv("REPORTS_TOKENS_JSON", JSON.stringify({ [UK]: REPORTS_TOKEN }));
  vi.stubEnv("BOARD_TOKENS_JSON", JSON.stringify({ [UK]: BOARD_TOKEN }));
  await prisma.report.deleteMany({ where: { projectKey: UK } });
  await prisma.boardTicket.deleteMany({ where: { projectKey: UK } });
  await prisma.report.deleteMany({ where: { projectKey: "itsutsu-dev" } });
});

describe("creating a report", () => {
  it("creates one signed in and one signed out, both with reporterRef required", async () => {
    const signedIn = await create(UK, { ...draft, reporterName: "Alex" });
    expect(signedIn.status).toBe(201);
    expect(signedIn.json.report).toMatchObject({ status: "new", reporterRef: "member-1", reporterName: "Alex", filedTicketId: null });

    const signedOut = await create(UK, { body: "Login button is dead.", reporterRef: "anon-session-9" });
    expect(signedOut.status).toBe(201);
    expect(signedOut.json.report!.reporterName).toBeNull();
  });

  it("refuses a body under the minimum or a missing reporterRef, and writes nothing", async () => {
    expect((await create(UK, { body: "ab", reporterRef: "m" })).status).toBe(422);
    expect((await create(UK, { body: "A fine body here", reporterRef: "" })).status).toBe(422);
    expect((await listReports(UK)).json.reports).toEqual([]);
  });

  it("401s a bad or missing token", async () => {
    const refused = await create(UK, draft);
    const withBadToken = read(await createRoute(request("POST", `${UK}/reports`, { body: draft, token: "wrong" }), inProject(UK)));
    expect((await withBadToken).status).toBe(401);
    expect(refused.status).toBe(201); // sanity: the good token above still works
  });

  it("rate-limits a reporter past the window, and reports it as such", async () => {
    for (let i = 0; i < 5; i += 1) expect((await create(UK, { ...draft, reporterRef: "busy-1" })).status).toBe(201);
    const sixth = await create(UK, { ...draft, reporterRef: "busy-1" });
    expect(sixth.status).toBe(429);
    expect(sixth.json).toMatchObject({ ok: false, error: "rate_limited", scope: "reporter" });
    /* a different reporter is unaffected */
    expect((await create(UK, { ...draft, reporterRef: "busy-2" })).status).toBe(201);
  });
});

describe("listing and reading", () => {
  it("lists newest first and filters by status", async () => {
    const a = (await create(UK, { ...draft, reporterRef: "r-a" })).json.report!;
    const b = (await create(UK, { ...draft, reporterRef: "r-b" })).json.report!;
    await patch(UK, a.id, { status: "read" });

    const all = await listReports(UK);
    expect(all.json.reports!.map((r) => r.id)).toEqual([b.id, a.id]);

    const onlyNew = await listReports(UK, "status=new");
    expect(onlyNew.json.reports!.map((r) => r.id)).toEqual([b.id]);
  });

  it("refuses an unknown status word", async () => {
    expect((await listReports(UK, "status=bogus")).status).toBe(400);
  });

  it("404s a report that does not exist", async () => {
    expect((await getReport(UK, "nope")).status).toBe(404);
  });
});

describe("patching a report", () => {
  it("moves new to read, and either to closed", async () => {
    const made = (await create(UK, draft)).json.report!;
    const read1 = await patch(UK, made.id, { status: "read" });
    expect(read1.json.report!.status).toBe("read");
    const closed = await patch(UK, made.id, { status: "closed" });
    expect(closed.json.report!.status).toBe("closed");
  });

  it("refuses status: filed - that is the file route's job alone", async () => {
    const made = (await create(UK, draft)).json.report!;
    const refused = await patch(UK, made.id, { status: "filed" });
    expect(refused.status).toBe(400); // not even a legal enum value on this schema
  });

  it("refuses a move back out of closed, 409", async () => {
    const made = (await create(UK, draft)).json.report!;
    await patch(UK, made.id, { status: "closed" });
    const refused = await patch(UK, made.id, { status: "read" });
    expect(refused.status).toBe(409);
  });

  it("writes an admin note without requiring a status", async () => {
    const made = (await create(UK, draft)).json.report!;
    const noted = await patch(UK, made.id, { adminNote: "Reproduced on iOS." });
    expect(noted.json.report!.adminNote).toBe("Reproduced on iOS.");
    expect(noted.json.report!.status).toBe("new");
  });

  it("400s a PATCH with no actor", async () => {
    const made = (await create(UK, draft)).json.report!;
    const refused = await patch(UK, made.id, { status: "read" }, null);
    expect(refused.status).toBe(400);
  });
});

describe("filing a report", () => {
  it("creates a board ticket and links it, atomically", async () => {
    const made = (await create(UK, draft)).json.report!;
    const filed = await file(UK, made.id);
    expect(filed.status).toBe(200);
    expect(filed.json.report!.status).toBe("filed");
    expect(filed.json.report!.filedTicketId).toBe(filed.json.ticketId);

    const ticket = await prisma.boardTicket.findFirst({ where: { id: filed.json.ticketId!, projectKey: UK } });
    expect(ticket).not.toBeNull();
    expect((ticket as { detail: string }).detail).toContain(draft.body);
  });

  it("refuses the reports token for filing - filing needs the board token", async () => {
    const made = (await create(UK, draft)).json.report!;
    const refused = read(
      await fileRoute(request("POST", `${UK}/reports/${made.id}/file`, { body: {}, actor: "admin-alex", token: REPORTS_TOKEN }), onReport(UK, made.id)),
    );
    expect((await refused).status).toBe(401);
  });

  it("refuses filing an already-closed report, 409, and creates no ticket", async () => {
    const made = (await create(UK, draft)).json.report!;
    await patch(UK, made.id, { status: "closed" });
    const refused = await file(UK, made.id);
    expect(refused.status).toBe(409);
    expect(await prisma.boardTicket.count({ where: { projectKey: UK } })).toBe(0);
  });

  it("takes a title/detail/kind override", async () => {
    const made = (await create(UK, draft)).json.report!;
    const filed = await file(UK, made.id, { title: "Map broken on phones", kind: "fix" });
    const ticket = await prisma.boardTicket.findFirst({ where: { id: filed.json.ticketId! } });
    expect((ticket as { title: string }).title).toBe("Map broken on phones");
  });
});

describe("importing a client's existing reports table", () => {
  const row = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    body: "A report brought over from the old table.",
    reporterRef: "old-member-1",
    status: "new",
    createdAt: "2026-09-01T00:00:00.000Z",
    ...extra,
  });

  it("keeps the id and createdAt, and answers how many landed", async () => {
    const outcome = await importRows(UK, [row("legacy-report-1"), row("legacy-report-2", { status: "closed" })]);
    expect(outcome.status).toBe(200);
    expect(outcome.json.imported).toBe(2);
    const first = await getReport(UK, "legacy-report-1");
    expect(first.json.report!.createdAt).toBe("2026-09-01T00:00:00.000Z");
    const second = await getReport(UK, "legacy-report-2");
    expect(second.json.report!.status).toBe("closed");
  });

  it("is safe to re-run: upserts by id rather than duplicating", async () => {
    await importRows(UK, [row("legacy-report-3")]);
    const again = await importRows(UK, [row("legacy-report-3", { status: "read" })]);
    expect(again.status).toBe(200);
    expect((await listReports(UK)).json.reports!.filter((r) => r.id === "legacy-report-3")).toHaveLength(1);
    expect((await getReport(UK, "legacy-report-3")).json.report!.status).toBe("read");
  });

  it("carries filedTicketId across without creating a new board ticket", async () => {
    await importRows(UK, [row("legacy-report-4", { status: "filed", filedTicketId: "old-ticket-9" })]);
    expect((await getReport(UK, "legacy-report-4")).json.report!.filedTicketId).toBe("old-ticket-9");
    expect(await prisma.boardTicket.count({ where: { projectKey: UK } })).toBe(0);
  });

  it("refuses the whole batch, 422, on a row that fails the draft caps, and writes nothing", async () => {
    const refused = await importRows(UK, [row("legacy-report-5"), row("legacy-report-6", { body: "" })]);
    expect(refused.status).toBe(422);
    expect((await getReport(UK, "legacy-report-5")).status).toBe(404);
  });

  it("400s an import with no actor", async () => {
    expect((await importRows(UK, [row("legacy-report-7")], null)).status).toBe(400);
  });
});

describe("deleting a report", () => {
  it("removes it, and a second delete 404s", async () => {
    const made = (await create(UK, draft)).json.report!;
    expect((await remove(UK, made.id)).json.deleted).toBe(true);
    expect((await remove(UK, made.id)).status).toBe(404);
    expect((await getReport(UK, made.id)).status).toBe(404);
  });

  it("400s a DELETE with no actor", async () => {
    const made = (await create(UK, draft)).json.report!;
    expect((await remove(UK, made.id, null)).status).toBe(400);
  });
});

describe("a screenshot on a report", () => {
  it("is stored with the report and listed only as hasImage", async () => {
    const made = await create(UK, { ...draft, image: png() });
    expect(made.status).toBe(201);
    expect(made.json.report!.hasImage).toBe(true);
    expect(made.json.report).not.toHaveProperty("imageBytes");
    expect(made.json.report).not.toHaveProperty("image");

    const plain = (await create(UK, { ...draft, reporterRef: "member-2" })).json.report!;
    expect(plain.hasImage).toBe(false);

    const listed = (await listReports(UK)).json.reports!;
    expect(listed.map((r) => r.hasImage)).toEqual([false, true]);
    expect((await getReport(UK, made.json.report!.id)).json.report!.hasImage).toBe(true);
  });

  it("serves the bytes with the type read from them, to the reports or the board token", async () => {
    const sent = png(4096);
    const made = (await create(UK, { ...draft, image: sent })).json.report!;

    const viaReports = await image(UK, made.id);
    expect(viaReports.status).toBe(200);
    expect(viaReports.headers.get("content-type")).toBe("image/png");
    expect(viaReports.headers.get("cache-control")).toBe("private, no-store");
    expect(viaReports.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await viaReports.arrayBuffer()).toString("base64")).toBe(sent);

    expect((await image(UK, made.id, BOARD_TOKEN)).status).toBe(200);
  });

  it("401s any other token, and 404s a report with no image or in another project", async () => {
    vi.stubEnv("REPORTS_TOKENS_JSON", JSON.stringify({ [UK]: REPORTS_TOKEN, "itsutsu-dev": "its-reports-token" }));
    const made = (await create(UK, { ...draft, image: png() })).json.report!;
    expect((await image(UK, made.id, "wrong")).status).toBe(401);
    expect((await image(UK, made.id, "its-reports-token")).status).toBe(401);
    expect((await image("itsutsu-dev", made.id, "its-reports-token")).status).toBe(404);

    const plain = (await create(UK, { ...draft, reporterRef: "member-2" })).json.report!;
    expect((await image(UK, plain.id)).status).toBe(404);
  });

  it("refuses a file that is not a JPEG, PNG or WebP, whatever it claims, and writes nothing", async () => {
    const svg = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>").toString("base64");
    const refused = await create(UK, { ...draft, image: svg });
    expect(refused.status).toBe(422);
    expect(refused.json.problems).toEqual(["An image must be a JPEG, PNG or WebP file."]);
    expect((await listReports(UK)).json.reports).toEqual([]);
    expect(await prisma.reportImage.count()).toBe(0);
  });

  it("refuses an image over 1 MiB in words, and a far larger body as a payload", async () => {
    expect((await create(UK, { ...draft, image: png(MIB + 1) })).status).toBe(422);
    expect((await create(UK, { ...draft, image: png(MIB) })).status).toBe(201);
    expect((await create(UK, { ...draft, reporterRef: "member-3", image: png(2 * MIB + 3) })).status).toBe(400);
  });

  it("holds one reporter to 3 MiB of images in the window, and still takes their text", async () => {
    for (let i = 0; i < 3; i += 1) expect((await create(UK, { ...draft, reporterRef: "shots-1", image: png(MIB) })).status).toBe(201);
    const fourth = await create(UK, { ...draft, reporterRef: "shots-1", image: png(1024) });
    expect(fourth.status).toBe(429);
    expect(fourth.json).toMatchObject({ ok: false, error: "rate_limited", scope: "reporter", limit: "image_bytes" });
    expect((await create(UK, { ...draft, reporterRef: "shots-1" })).status).toBe(201);
    expect((await create(UK, { ...draft, reporterRef: "shots-2", image: png(MIB) })).status).toBe(201);
  });

  it("holds a project to 25 MiB of images an hour across reporters", async () => {
    for (let i = 0; i < 25; i += 1) expect((await create(UK, { ...draft, reporterRef: `crowd-${i}`, image: png(MIB) })).status).toBe(201);
    const over = await create(UK, { ...draft, reporterRef: "crowd-last", image: png(1024) });
    expect(over.status).toBe(429);
    expect(over.json).toMatchObject({ scope: "project", limit: "image_bytes" });
  });

  it("names the report count as the limit when that is what was hit", async () => {
    for (let i = 0; i < 5; i += 1) await create(UK, { ...draft, reporterRef: "chatty" });
    expect((await create(UK, { ...draft, reporterRef: "chatty" })).json.limit).toBe("reports");
  });

  it("goes when its report is deleted", async () => {
    const made = (await create(UK, { ...draft, image: png() })).json.report!;
    expect(await prisma.reportImage.count()).toBe(1);
    await remove(UK, made.id);
    expect(await prisma.reportImage.count()).toBe(0);
    expect((await image(UK, made.id)).status).toBe(404);
  });
});
