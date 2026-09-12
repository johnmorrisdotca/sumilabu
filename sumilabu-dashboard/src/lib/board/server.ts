import { prisma } from "@/lib/prisma";

import {
  SHIPPABLE_FROM,
  canMove,
  draftProblems,
  heldNow,
  isTicketStatus,
  moveData,
  moveWhere,
  shipData,
  unshipData,
  type TicketEffort,
  type TicketKind,
  type TicketMoveTarget,
  type TicketPriority,
  type TicketStatus,
} from "./rules";

/** A ticket as the API returns it: the row, plus the one derived fact every reader needs. */
export type BoardTicketView = {
  id: string;
  projectKey: string;
  title: string;
  detail: string | null;
  area: string | null;
  kind: string;
  status: TicketStatus;
  priority: TicketPriority | null;
  effort: TicketEffort | null;
  askedBy: string | null;
  claimedBy: string | null;
  claimedAt: string | null;
  /** Invariant 3, computed here so no client counts the status column alone. */
  heldNow: boolean;
  releasedIn: string | null;
  releasedEntry: string | null;
  releasedAt: string | null;
  createdAt: string;
  movedAt: string;
};

type Row = {
  id: string; projectKey: string; title: string; detail: string | null; area: string | null; kind: string;
  status: string; priority: string | null; effort: string | null; askedBy: string | null; claimedBy: string | null;
  claimedAt: Date | null; releasedIn: string | null; releasedEntry: string | null; releasedAt: Date | null; createdAt: Date; movedAt: Date;
};

function view(row: Row, now = new Date()): BoardTicketView {
  return {
    ...row,
    status: isTicketStatus(row.status) ? row.status : "open",
    priority: (row.priority as TicketPriority | null) ?? null,
    effort: (row.effort as TicketEffort | null) ?? null,
    claimedAt: row.claimedAt?.toISOString() ?? null,
    heldNow: heldNow(row, now.getTime()),
    releasedAt: row.releasedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    movedAt: row.movedAt.toISOString(),
  };
}

/**
 * `statuses` narrows to canonical statuses; `unfinished` is open and
 * inProgress together, stale holds included - a lapsed hold is shown as
 * stale, not dropped, which is invariant 3 and the reason the CLI asks for
 * this rather than for open alone.
 */
export async function listTickets(
  projectKey: string,
  filter: { statuses?: readonly TicketStatus[]; unfinished?: boolean } = {},
): Promise<BoardTicketView[]> {
  const statuses = filter.unfinished ? (["open", "inProgress"] as TicketStatus[]) : filter.statuses;
  const rows = await prisma.boardTicket.findMany({
    where: { projectKey, ...(statuses && statuses.length > 0 ? { status: { in: [...statuses] } } : {}) },
    orderBy: [{ movedAt: "desc" }],
  });
  const now = new Date();
  return rows.map((row) => view(row, now));
}

export async function getTicket(projectKey: string, id: string): Promise<BoardTicketView | null> {
  const row = await prisma.boardTicket.findFirst({ where: { id, projectKey } });
  return row ? view(row) : null;
}

export type TicketDraft = {
  title: string;
  detail?: string | null;
  area?: string | null;
  kind: TicketKind;
  askedBy?: string | null;
};

export type CreateOutcome = { ok: true; ticket: BoardTicketView } | { ok: false; problems: string[] };

export async function createTicket(projectKey: string, draft: TicketDraft): Promise<CreateOutcome> {
  const problems = draftProblems(draft);
  if (problems.length > 0) return { ok: false, problems };
  const row = await prisma.boardTicket.create({
    data: {
      projectKey,
      title: draft.title.trim(),
      detail: draft.detail?.trim() || null,
      area: draft.area?.trim() || null,
      kind: draft.kind,
      askedBy: draft.askedBy?.trim() || null,
    },
  });
  return { ok: true, ticket: view(row) };
}

export type MoveOutcome =
  | { ok: true; ticket: BoardTicketView }
  | { ok: false; reason: "missing" | "illegal" | "held"; ticket: BoardTicketView | null; heldBy?: string | null };

/**
 * Invariant 4: one conditional write, then a re-read only to say why it
 * did not happen. Never read-then-write.
 */
export async function moveTicket(projectKey: string, id: string, to: TicketMoveTarget, actor: string): Promise<MoveOutcome> {
  const now = new Date();
  const before = await prisma.boardTicket.findFirst({ where: { id, projectKey }, select: { status: true } });
  if (!before || !isTicketStatus(before.status)) return { ok: false, reason: "missing", ticket: null };
  if (!canMove(before.status, to)) return { ok: false, reason: "illegal", ticket: await getTicket(projectKey, id) };

  const moved = await prisma.boardTicket.updateMany({
    where: moveWhere(id, projectKey, before.status, actor, now),
    data: moveData(to, actor, now),
  });
  const after = await getTicket(projectKey, id);
  if (moved.count === 1 && after) return { ok: true, ticket: after };
  if (!after) return { ok: false, reason: "missing", ticket: null };
  if (after.status !== before.status) return { ok: false, reason: "illegal", ticket: after };
  return { ok: false, reason: "held", ticket: after, heldBy: after.claimedBy };
}

export type TicketGrade = { priority?: TicketPriority | null; effort?: TicketEffort | null };

/** Invariant 8: grading is not movement, so `movedAt` stays. */
export async function gradeTicket(projectKey: string, id: string, grade: TicketGrade): Promise<BoardTicketView | null> {
  const data: { priority?: string | null; effort?: string | null } = {};
  if (grade.priority !== undefined) data.priority = grade.priority;
  if (grade.effort !== undefined) data.effort = grade.effort;
  if (Object.keys(data).length === 0) return getTicket(projectKey, id);
  const updated = await prisma.boardTicket.updateMany({ where: { id, projectKey }, data });
  return updated.count === 1 ? getTicket(projectKey, id) : null;
}

/**
 * Invariant 9. Only a release tool calls it, from open or inProgress - a
 * ticket filed and shipped in one pass was never claimed - and under the same
 * claim condition as a move, so a ticket somebody else holds live cannot be
 * shipped from under them.
 */
export async function shipTicket(
  projectKey: string,
  id: string,
  ship: { version: string; entryId: string | null; releasedAt: Date },
  actor: string,
): Promise<MoveOutcome> {
  const before = await prisma.boardTicket.findFirst({ where: { id, projectKey }, select: { status: true } });
  if (!before || !isTicketStatus(before.status)) return { ok: false, reason: "missing", ticket: null };
  if (!(SHIPPABLE_FROM as readonly string[]).includes(before.status)) {
    return { ok: false, reason: "illegal", ticket: await getTicket(projectKey, id) };
  }
  const moved = await prisma.boardTicket.updateMany({
    where: moveWhere(id, projectKey, before.status, actor, ship.releasedAt),
    data: shipData(ship.version, ship.entryId, ship.releasedAt),
  });
  const after = await getTicket(projectKey, id);
  if (moved.count === 1 && after) return { ok: true, ticket: after };
  return { ok: false, reason: after?.status === before.status ? "held" : "illegal", ticket: after, heldBy: after?.claimedBy };
}

/** One row of a client's existing board, brought over as it stands. */
export type ImportRow = {
  id: string;
  title: string;
  detail?: string | null;
  area?: string | null;
  kind: TicketKind;
  status: TicketStatus;
  priority?: TicketPriority | null;
  effort?: TicketEffort | null;
  askedBy?: string | null;
  claimedBy?: string | null;
  claimedAt?: Date | null;
  releasedIn?: string | null;
  releasedEntry?: string | null;
  releasedAt?: Date | null;
  createdAt: Date;
  movedAt: Date;
};

/**
 * The one-time move of a client's board, keeping ids and dates.
 *
 * Every plan, memory note and commit message on the client cites ticket ids,
 * and three hundred createdAt/movedAt values mean something; a migration that
 * renumbered would rewrite every reference. Upserts by id so it can be re-run
 * after a failed half. The caps still apply: a row past them is refused by
 * name rather than truncated, and the client trims it first.
 */
export async function importTickets(
  projectKey: string,
  rows: readonly ImportRow[],
): Promise<{ ok: true; imported: number } | { ok: false; problems: string[] }> {
  const problems: string[] = [];
  for (const row of rows) {
    for (const problem of draftProblems({ title: row.title, detail: row.detail, askedBy: row.askedBy })) {
      problems.push(`${row.id}: ${problem}`);
    }
    if ((row.claimedBy ?? "").length > 80) problems.push(`${row.id}: claimedBy is at most 80 characters.`);
  }
  if (problems.length > 0) return { ok: false, problems };

  let imported = 0;
  for (const row of rows) {
    const data = {
      projectKey,
      title: row.title.trim(),
      detail: row.detail ?? null,
      area: row.area ?? null,
      kind: row.kind,
      status: row.status,
      priority: row.priority ?? null,
      effort: row.effort ?? null,
      askedBy: row.askedBy ?? null,
      claimedBy: row.claimedBy ?? null,
      claimedAt: row.claimedAt ?? null,
      releasedIn: row.releasedIn ?? null,
      releasedEntry: row.releasedEntry ?? null,
      releasedAt: row.releasedAt ?? null,
      createdAt: row.createdAt,
      movedAt: row.movedAt,
    };
    await prisma.boardTicket.upsert({ where: { id: row.id }, create: { id: row.id, ...data }, update: data });
    imported += 1;
  }
  return { ok: true, imported };
}

/**
 * The one way out of done: the client has asked its own main and the stamped
 * version is not there. The service cannot check that; it records who said
 * so and why.
 */
export async function unshipTicket(projectKey: string, id: string): Promise<MoveOutcome> {
  const now = new Date();
  const moved = await prisma.boardTicket.updateMany({ where: { id, projectKey, status: "done" }, data: unshipData(now) });
  const after = await getTicket(projectKey, id);
  if (moved.count === 1 && after) return { ok: true, ticket: after };
  if (!after) return { ok: false, reason: "missing", ticket: null };
  return { ok: false, reason: "illegal", ticket: after };
}

/* --- Settings ------------------------------------------------------------ */

export async function listSettings(projectKey: string): Promise<Record<string, string>> {
  const rows = await prisma.boardSetting.findMany({ where: { projectKey }, select: { key: true, value: true } });
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function getSetting(projectKey: string, key: string): Promise<string | null> {
  const row = await prisma.boardSetting.findUnique({ where: { projectKey_key: { projectKey, key } }, select: { value: true } });
  return row?.value ?? null;
}

export async function setSetting(projectKey: string, key: string, value: string, actor: string): Promise<void> {
  await prisma.boardSetting.upsert({
    where: { projectKey_key: { projectKey, key } },
    create: { projectKey, key, value, setBy: actor },
    update: { value, setBy: actor },
  });
}
