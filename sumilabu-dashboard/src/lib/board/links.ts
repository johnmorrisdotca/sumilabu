import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { formatShortId, linkPair } from "./rules";
import { resolveTicketId } from "./seq";
import { forgetBoard } from "./ticketCache";

/**
 * Related links between tickets (invariant 18), and the short-id reading of a
 * ticket's family that the single-ticket read carries (invariant 17).
 *
 * A link is one row for the pair, lower id first, so it reads the same from
 * either end and the unique index keeps it single. It is allowed on a ticket
 * in any status: it adds a pointer and rewrites none of the words invariant
 * 12 freezes.
 */

type Numbered = { id: string; seq: number | null };

/** `SPX-142`, or the id itself for a row nothing has numbered. In the order of their numbers. */
export function shortIds(projectKey: string, rows: readonly Numbered[]): string[] {
  return [...rows]
    .sort((a, b) => (a.seq ?? Infinity) - (b.seq ?? Infinity) || a.id.localeCompare(b.id))
    .map((row) => formatShortId(projectKey, row.seq) ?? row.id);
}

/** The tickets linked to this one, from either end, as short ids. Two reads, the second only when there is a link. */
export async function relatedShortIds(projectKey: string, ticketId: string): Promise<string[]> {
  const links = await prisma.boardTicketLink.findMany({
    where: { projectKey, OR: [{ lowId: ticketId }, { highId: ticketId }] },
    select: { lowId: true, highId: true },
  });
  if (links.length === 0) return [];
  const others = links.map((link) => (link.lowId === ticketId ? link.highId : link.lowId));
  const rows = await prisma.boardTicket.findMany({ where: { projectKey, id: { in: others } }, select: { id: true, seq: true } });
  return shortIds(projectKey, rows);
}

export type LinkOutcome =
  | { ok: true; created: boolean; related: string[] }
  | { ok: false; reason: "invalid"; problems: string[] }
  | { ok: false; reason: "missing" };

/**
 * Links two tickets of this project. Idempotent: the pair already linked is
 * `created: false`, not an error. The other ticket is named by short id or
 * cuid; one that is not a ticket of this project (another project's included)
 * is 422, since the body named it wrongly, and the ticket in the path missing
 * is 404.
 */
export async function addTicketLink(projectKey: string, idOrShortId: string, otherInput: string, actor: string): Promise<LinkOutcome> {
  const ticketId = await resolveTicketId(projectKey, idOrShortId);
  const ticket = await prisma.boardTicket.findFirst({ where: { id: ticketId, projectKey }, select: { id: true } });
  if (!ticket) return { ok: false, reason: "missing" };

  const otherId = await resolveTicketId(projectKey, otherInput);
  if (otherId === ticketId) return { ok: false, reason: "invalid", problems: ["A ticket cannot be linked to itself."] };
  const other = await prisma.boardTicket.findFirst({ where: { id: otherId, projectKey }, select: { id: true } });
  if (!other) return { ok: false, reason: "invalid", problems: ["The linked ticket must be a ticket in this project."] };

  const [lowId, highId] = linkPair(ticketId, otherId);
  let created = true;
  try {
    await prisma.boardTicketLink.create({ data: { projectKey, lowId, highId, by: actor } });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    created = false;
  }
  if (created) forgetBoard(projectKey);
  return { ok: true, created, related: await relatedShortIds(projectKey, ticketId) };
}

export type UnlinkOutcome = { ok: true; removed: boolean; related: string[] } | { ok: false; reason: "missing" };

/** Removes the link between two tickets. A link that is not there is already gone: `removed: false`, not an error. */
export async function removeTicketLink(projectKey: string, idOrShortId: string, otherInput: string): Promise<UnlinkOutcome> {
  const ticketId = await resolveTicketId(projectKey, idOrShortId);
  const ticket = await prisma.boardTicket.findFirst({ where: { id: ticketId, projectKey }, select: { id: true } });
  if (!ticket) return { ok: false, reason: "missing" };

  const [lowId, highId] = linkPair(ticketId, await resolveTicketId(projectKey, otherInput));
  const gone = await prisma.boardTicketLink.deleteMany({ where: { projectKey, lowId, highId } });
  if (gone.count > 0) forgetBoard(projectKey);
  return { ok: true, removed: gone.count > 0, related: await relatedShortIds(projectKey, ticketId) };
}
