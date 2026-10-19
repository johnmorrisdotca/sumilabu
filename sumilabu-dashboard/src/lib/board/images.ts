import { prisma } from "@/lib/prisma";
import { decodeReportImage, type ReportImageType } from "@/lib/reports/image";

import { TEXT_EDITABLE_FROM } from "./rules";
import { resolveTicketId } from "./seq";

/**
 * Screenshots attached to a ticket (BOARD_RULES.md, "Ticket images"). The
 * bytes live in this service's own Postgres, on a free plan whose 0.5 GB
 * every project shares and which telemetry filled once (2026-10-07), so
 * every number here is a storage decision:
 *
 * - 512 KB an image. A client shrinks a screenshot to WebP at a readable
 *   width before sending it, which makes it 100-250 KB; the cap refuses a
 *   raw full-resolution PNG rather than storing it.
 * - Four a ticket: a request is a few pictures, not an album.
 * - 50 MB a project, all its tickets together, about a tenth of the plan.
 * - A ticket done or dropped for 30 days loses its images, the next time
 *   anybody in the project attaches one - work a person started, never a
 *   timer, and no reader of a closed ticket's pictures has been seen.
 */
export const TICKET_IMAGE_LIMITS = {
  maxBytes: 512 * 1024,
  perTicket: 4,
  perProjectBytes: 50 * 1024 * 1024,
  keepAfterClosedMs: 30 * 24 * 60 * 60 * 1000,
} as const;

/** What a ticket's image list says about each image; never the bytes. */
export type TicketImageView = {
  id: string;
  ticketId: string;
  contentType: ReportImageType;
  byteSize: number;
  addedBy: string | null;
  createdAt: string;
};

type MetaRow = { id: string; ticketId: string; contentType: string; byteSize: number; addedBy: string | null; createdAt: Date };

const META = { id: true, ticketId: true, contentType: true, byteSize: true, addedBy: true, createdAt: true } as const;

function view(row: MetaRow): TicketImageView {
  return {
    id: row.id,
    ticketId: row.ticketId,
    contentType: row.contentType as ReportImageType,
    byteSize: row.byteSize,
    addedBy: row.addedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

/** A ticket's images, oldest first, or null when the ticket is not this project's. */
export async function listTicketImages(projectKey: string, idOrShortId: string): Promise<TicketImageView[] | null> {
  const ticketId = await resolveTicketId(projectKey, idOrShortId);
  const ticket = await prisma.boardTicket.findFirst({ where: { id: ticketId, projectKey }, select: { id: true } });
  if (!ticket) return null;
  const rows = await prisma.boardTicketImage.findMany({ where: { ticketId, projectKey }, select: META, orderBy: { createdAt: "asc" } });
  return (rows as MetaRow[]).map(view);
}

export type StoredTicketImage = { contentType: ReportImageType; bytes: Buffer };

/**
 * One image's bytes, found by its id, its ticket and its project together, so
 * a token for one project cannot read another's by guessing an id.
 */
export async function getTicketImage(projectKey: string, idOrShortId: string, imageId: string): Promise<StoredTicketImage | null> {
  const ticketId = await resolveTicketId(projectKey, idOrShortId);
  const row = await prisma.boardTicketImage.findFirst({ where: { id: imageId, ticketId, projectKey } });
  if (!row) return null;
  const image = row as { contentType: string; bytes: Uint8Array };
  return { contentType: image.contentType as ReportImageType, bytes: Buffer.from(image.bytes) };
}

/** Deletes the images of this project's tickets done or dropped more than 30 days ago; how many went. */
export async function pruneClosedTicketImages(projectKey: string, now = new Date()): Promise<number> {
  const held = (await prisma.boardTicketImage.findMany({ where: { projectKey }, select: { ticketId: true } })) as { ticketId: string }[];
  const ticketIds = [...new Set(held.map((row) => row.ticketId))];
  if (ticketIds.length === 0) return 0;
  const closed = (await prisma.boardTicket.findMany({
    where: {
      id: { in: ticketIds },
      projectKey,
      status: { in: ["done", "dropped"] },
      movedAt: { lt: new Date(now.getTime() - TICKET_IMAGE_LIMITS.keepAfterClosedMs) },
    },
    select: { id: true },
  })) as { id: string }[];
  if (closed.length === 0) return 0;
  const { count } = await prisma.boardTicketImage.deleteMany({ where: { projectKey, ticketId: { in: closed.map((row) => row.id) } } });
  return count;
}

export type AttachOutcome =
  | { ok: true; image: TicketImageView }
  | { ok: false; reason: "invalid"; problems: string[] }
  | { ok: false; reason: "missing" | "done" };

/**
 * Attaches one image, sent as plain base64. Checked in order, and nothing is
 * written until every check passes: the bytes (type by magic number, the
 * size cap), the ticket (this project's, and not done - invariant 12 freezes
 * a done row's words, and its pictures are part of them), then the counts.
 * The prune runs before the counts so a project at its budget frees what its
 * closed tickets held first.
 *
 * The counts are read, then the row written: two attaches racing can land a
 * fifth image or pass the budget by one image. That is a few hundred KB over
 * a soft storage line, not a state the rest of the board relies on, so it is
 * not worth a lock.
 */
export async function attachTicketImage(projectKey: string, idOrShortId: string, base64: string, actor: string): Promise<AttachOutcome> {
  const ticketId = await resolveTicketId(projectKey, idOrShortId);
  const decoded = decodeReportImage(base64, TICKET_IMAGE_LIMITS.maxBytes);
  if (!decoded.ok) return { ok: false, reason: "invalid", problems: [decoded.problem] };

  const ticket = (await prisma.boardTicket.findFirst({ where: { id: ticketId, projectKey }, select: { id: true, status: true } })) as
    | { id: string; status: string }
    | null;
  if (!ticket) return { ok: false, reason: "missing" };
  if (!(TEXT_EDITABLE_FROM as readonly string[]).includes(ticket.status)) return { ok: false, reason: "done" };

  await pruneClosedTicketImages(projectKey);
  const held = (await prisma.boardTicketImage.findMany({ where: { projectKey }, select: { ticketId: true, byteSize: true } })) as {
    ticketId: string;
    byteSize: number;
  }[];
  const onTicket = held.filter((row) => row.ticketId === ticketId).length;
  if (onTicket >= TICKET_IMAGE_LIMITS.perTicket) {
    return { ok: false, reason: "invalid", problems: [`A ticket holds at most ${TICKET_IMAGE_LIMITS.perTicket} images.`] };
  }
  const projectBytes = held.reduce((sum, row) => sum + row.byteSize, 0);
  if (projectBytes + decoded.bytes.length > TICKET_IMAGE_LIMITS.perProjectBytes) {
    return {
      ok: false,
      reason: "invalid",
      problems: ["This project's ticket images are at their 50 MB limit. Images on tickets closed for 30 days are removed as new ones arrive."],
    };
  }

  const created = await prisma.boardTicketImage.create({
    data: {
      ticketId,
      projectKey,
      contentType: decoded.contentType,
      byteSize: decoded.bytes.length,
      bytes: new Uint8Array(decoded.bytes),
      addedBy: actor,
    },
    select: META,
  });
  return { ok: true, image: view(created as MetaRow) };
}
