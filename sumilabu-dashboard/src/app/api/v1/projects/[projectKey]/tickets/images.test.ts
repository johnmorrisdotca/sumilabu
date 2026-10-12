import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TICKET_IMAGE_LIMITS, type TicketImageView } from "@/lib/board/images";
import { prisma } from "@/lib/prisma";

import { GET as getImage } from "./[ticketId]/images/[imageId]/route";
import { GET as listImages, POST as attach } from "./[ticketId]/images/route";
import { POST as createRoute } from "./route";

/* The ticket image routes against the in-memory board (memoryPrisma.ts). */
vi.mock("@/lib/prisma", async () => {
  const { memoryPrisma } = await import("@/lib/board/memoryPrisma");
  return { prisma: memoryPrisma() };
});

const TOKEN = "test-board-token";
const UK = "umakuma-dev";
const ITS = "itsutsu-dev";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

function imageBase64(signature: number[], size = 64): string {
  const out = Buffer.alloc(Math.max(size, signature.length));
  Buffer.from(signature).copy(out);
  return out.toString("base64");
}

function request(method: string, path: string, { body, actor = "uk-builder" }: { body?: unknown; actor?: string | null } = {}) {
  const headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` };
  if (actor) headers["x-board-actor"] = actor;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost/api/v1/projects/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

type Body = { ok: boolean; error?: string; problems?: string[]; image?: TicketImageView; images?: TicketImageView[]; ticket?: { id: string } };

async function newTicket(projectKey = UK): Promise<string> {
  const response = await createRoute(request("POST", `${projectKey}/tickets`, { body: { title: "Ticket with pictures" } }), {
    params: Promise.resolve({ projectKey }),
  });
  return ((await response.json()) as Body).ticket!.id;
}

const at = (projectKey: string, ticketId: string) => ({ params: Promise.resolve({ projectKey, ticketId }) });

async function send(projectKey: string, ticketId: string, image: string, actor: string | null = "uk-builder") {
  const response = await attach(request("POST", `${projectKey}/tickets/${ticketId}/images`, { body: { image }, actor }), at(projectKey, ticketId));
  return { status: response.status, json: (await response.json()) as Body };
}

beforeEach(() => {
  vi.stubEnv("BOARD_TOKENS_JSON", JSON.stringify({ [UK]: TOKEN, [ITS]: TOKEN }));
});

describe("POST tickets/{id}/images", () => {
  it("attaches an image, typed by its bytes, and names who added it", async () => {
    const id = await newTicket();
    const { status, json } = await send(UK, id, imageBase64(WEBP, 2000));
    expect(status).toBe(201);
    expect(json.image).toMatchObject({ ticketId: id, contentType: "image/webp", byteSize: 2000, addedBy: "uk-builder" });
    expect(json.image).not.toHaveProperty("bytes");
  });

  it("needs an actor, a known ticket in this project, and real image bytes", async () => {
    const id = await newTicket();
    expect((await send(UK, id, imageBase64(PNG), null)).status).toBe(400);
    expect((await send(UK, "nope", imageBase64(PNG))).status).toBe(404);
    expect((await send(ITS, id, imageBase64(PNG))).status).toBe(404);
    const svg = await send(UK, id, Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>").toString("base64"));
    expect(svg.status).toBe(422);
    expect(svg.json.problems).toEqual(["An image must be a JPEG, PNG or WebP file."]);
  });

  it("refuses an image over 512 KB in words", async () => {
    const id = await newTicket();
    const { status, json } = await send(UK, id, imageBase64(PNG, TICKET_IMAGE_LIMITS.maxBytes + 1));
    expect(status).toBe(422);
    expect(json.problems?.[0]).toBe("An image is at most 524,288 bytes (512 KB).");
  });

  it("holds a ticket to four images", async () => {
    const id = await newTicket();
    for (let i = 0; i < TICKET_IMAGE_LIMITS.perTicket; i += 1) expect((await send(UK, id, imageBase64(PNG))).status).toBe(201);
    const fifth = await send(UK, id, imageBase64(PNG));
    expect(fifth.status).toBe(422);
    expect(fifth.json.problems).toEqual(["A ticket holds at most 4 images."]);
  });

  it("refuses a done ticket, whose words and pictures are frozen with its stamp", async () => {
    const id = await newTicket();
    await prisma.boardTicket.updateMany({ where: { id }, data: { status: "done" } });
    const { status, json } = await send(UK, id, imageBase64(PNG));
    expect(status).toBe(409);
    expect(json.error).toBe("done");
  });

  it("holds a project to its byte budget, and the prune frees what closed tickets held", async () => {
    const full = await newTicket();
    const big = TICKET_IMAGE_LIMITS.perProjectBytes - 100;
    await prisma.boardTicketImage.create({ data: { ticketId: full, projectKey: UK, contentType: "image/png", byteSize: big, bytes: new Uint8Array(1) } });
    const next = await newTicket();
    const over = await send(UK, next, imageBase64(PNG, 200));
    expect(over.status).toBe(422);
    expect(over.json.problems?.[0]).toContain("50 MB limit");
    expect((await send(ITS, await newTicket(ITS), imageBase64(PNG, 200))).status).toBe(201);

    const longAgo = new Date(Date.now() - TICKET_IMAGE_LIMITS.keepAfterClosedMs - 1000);
    await prisma.boardTicket.updateMany({ where: { id: full }, data: { status: "dropped", movedAt: longAgo } });
    expect((await send(UK, next, imageBase64(PNG, 200))).status).toBe(201);
    expect(await prisma.boardTicketImage.count({ where: { ticketId: full } })).toBe(0);
  });

  it("keeps the images of a ticket closed for less than 30 days", async () => {
    const recent = await newTicket();
    await send(UK, recent, imageBase64(PNG));
    await prisma.boardTicket.updateMany({ where: { id: recent }, data: { status: "done", movedAt: new Date(Date.now() - 1000) } });
    await send(UK, await newTicket(), imageBase64(PNG));
    expect(await prisma.boardTicketImage.count({ where: { ticketId: recent } })).toBe(1);
  });
});

describe("GET tickets/{id}/images and images/{imageId}", () => {
  it("lists without bytes, oldest first, and serves each image's bytes privately", async () => {
    const id = await newTicket();
    const png = imageBase64(PNG, 100);
    const first = (await send(UK, id, png)).json.image!;
    await send(UK, id, imageBase64(WEBP, 120));

    const listed = (await (await listImages(request("GET", `${UK}/tickets/${id}/images`, { actor: null }), at(UK, id))).json()) as Body;
    expect(listed.images?.map((image) => image.contentType)).toEqual(["image/png", "image/webp"]);

    const response = await getImage(request("GET", `${UK}/tickets/${id}/images/${first.id}`, { actor: null }), {
      params: Promise.resolve({ projectKey: UK, ticketId: id, imageId: first.id }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await response.arrayBuffer()).toString("base64")).toBe(png);
  });

  it("answers 404 across projects and 401 without the board token", async () => {
    const id = await newTicket();
    const image = (await send(UK, id, imageBase64(PNG))).json.image!;
    const fromIts = await getImage(request("GET", `${ITS}/tickets/${id}/images/${image.id}`), {
      params: Promise.resolve({ projectKey: ITS, ticketId: id, imageId: image.id }),
    });
    expect(fromIts.status).toBe(404);
    expect((await listImages(request("GET", `${ITS}/tickets/${id}/images`), at(ITS, id))).status).toBe(404);
    const anonymous = new NextRequest(`http://localhost/api/v1/projects/${UK}/tickets/${id}/images`);
    expect((await listImages(anonymous, at(UK, id))).status).toBe(401);
  });
});
