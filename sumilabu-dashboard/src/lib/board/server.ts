import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import {
  SHIPPABLE_FROM,
  TEXT_EDITABLE_FROM,
  canMove,
  draftProblems,
  foreignIdProblems,
  heldNow,
  isTicketStatus,
  moveData,
  moveWhere,
  shipData,
  textData,
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
  /** Invariant 11. Null for a ticket its client cites by id. */
  key: string | null;
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
  /** Invariant 12. Who last revised the title or detail, and when. */
  editedBy: string | null;
  editedAt: string | null;
  createdAt: string;
  movedAt: string;
};

type Row = {
  id: string; projectKey: string; key: string | null; title: string; detail: string | null; area: string | null; kind: string;
  status: string; priority: string | null; effort: string | null; askedBy: string | null; claimedBy: string | null;
  claimedAt: Date | null; releasedIn: string | null; releasedEntry: string | null; releasedAt: Date | null;
  editedBy: string | null; editedAt: Date | null; createdAt: Date; movedAt: Date;
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
    editedAt: row.editedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    movedAt: row.movedAt.toISOString(),
  };
}

/** The unique index on (projectKey, key) refusing a write. It is the lock; any read before it only names the holder. */
function keyTaken(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
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

/** Invariant 11. A client resolves a key to an id here, and addresses every write by the id. */
export async function getTicketByKey(projectKey: string, key: string): Promise<BoardTicketView | null> {
  const row = await prisma.boardTicket.findFirst({ where: { projectKey, key } });
  return row ? view(row) : null;
}

export type TicketDraft = {
  title: string;
  detail?: string | null;
  area?: string | null;
  kind: TicketKind;
  askedBy?: string | null;
  key?: string | null;
};

export type CreateOutcome =
  | { ok: true; ticket: BoardTicketView }
  | { ok: false; reason: "invalid"; problems: string[] }
  | { ok: false; reason: "keyTaken"; problems: string[]; ticketId: string | null };

export async function createTicket(projectKey: string, draft: TicketDraft): Promise<CreateOutcome> {
  const problems = draftProblems(draft);
  if (problems.length > 0) return { ok: false, reason: "invalid", problems };
  try {
    const row = await prisma.boardTicket.create({
      data: {
        projectKey,
        key: draft.key ?? null,
        title: draft.title.trim(),
        detail: draft.detail?.trim() || null,
        area: draft.area?.trim() || null,
        kind: draft.kind,
        askedBy: draft.askedBy?.trim() || null,
      },
    });
    return { ok: true, ticket: view(row) };
  } catch (error) {
    if (!draft.key || !keyTaken(error)) throw error;
    const holder = await getTicketByKey(projectKey, draft.key);
    return {
      ok: false,
      reason: "keyTaken",
      problems: [`The key ${draft.key} already belongs to ${holder ? `ticket ${holder.id}` : "another ticket"} in this project.`],
      ticketId: holder?.id ?? null,
    };
  }
}

export type MoveOutcome =
  | { ok: true; ticket: BoardTicketView }
  | { ok: false; reason: "missing" | "illegal" | "held" | "done"; ticket: BoardTicketView | null; heldBy?: string | null };

/** Invariant 12. The words a PATCH revises; an omitted field is left as it is. */
export type TicketText = { title?: string; detail?: string | null };

/**
 * Invariant 4: one conditional write, then a re-read only to say why it
 * did not happen. Never read-then-write.
 *
 * `text` rides in the same write, so a refused move revises nothing. A move
 * never starts from `done`, so the words it carries are always editable.
 */
export async function moveTicket(
  projectKey: string,
  id: string,
  to: TicketMoveTarget,
  actor: string,
  text?: TicketText,
): Promise<MoveOutcome> {
  const now = new Date();
  const before = await prisma.boardTicket.findFirst({ where: { id, projectKey }, select: { status: true } });
  if (!before || !isTicketStatus(before.status)) return { ok: false, reason: "missing", ticket: null };
  if (!canMove(before.status, to)) return { ok: false, reason: "illegal", ticket: await getTicket(projectKey, id) };

  const moved = await prisma.boardTicket.updateMany({
    where: moveWhere(id, projectKey, before.status, actor, now),
    data: { ...moveData(to, actor, now), ...(text ? textData(text, actor, now) : {}) },
  });
  const after = await getTicket(projectKey, id);
  if (moved.count === 1 && after) return { ok: true, ticket: after };
  if (!after) return { ok: false, reason: "missing", ticket: null };
  if (after.status !== before.status) return { ok: false, reason: "illegal", ticket: after };
  return { ok: false, reason: "held", ticket: after, heldBy: after.claimedBy };
}

/**
 * Invariant 12: a revision of the words, conditional on the row not being
 * `done`. It is not a move, so it carries no claim condition and `movedAt`
 * stays (invariant 8); the re-read only says why nothing was written.
 */
export async function reviseTicket(projectKey: string, id: string, text: TicketText, actor: string): Promise<MoveOutcome> {
  const revised = await prisma.boardTicket.updateMany({
    where: { id, projectKey, status: { in: [...TEXT_EDITABLE_FROM] } },
    data: textData(text, actor, new Date()),
  });
  const after = await getTicket(projectKey, id);
  if (revised.count === 1 && after) return { ok: true, ticket: after };
  if (!after) return { ok: false, reason: "missing", ticket: null };
  return { ok: false, reason: after.status === "done" ? "done" : "illegal", ticket: after };
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
  key?: string | null;
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
 * Invariant 11, asked of a whole import before anything is written: a key
 * that belongs to a different ticket is refused by row rather than
 * overwritten, and a key already stored on a row is never changed. A row
 * that omits its key keeps the stored one.
 */
async function importKeyProblems(projectKey: string, rows: readonly ImportRow[]): Promise<string[]> {
  const problems: string[] = [];
  const keyed = rows.filter((row): row is ImportRow & { key: string } => row.key != null);
  if (keyed.length === 0) return problems;

  const inBatch = new Map<string, string>();
  for (const row of keyed) {
    const first = inBatch.get(row.key);
    if (first === undefined) inBatch.set(row.key, row.id);
    else if (first !== row.id) problems.push(`${row.id}: the key ${row.key} is also on ${first} in this import.`);
  }

  const [holders, stored] = await Promise.all([
    prisma.boardTicket.findMany({ where: { projectKey, key: { in: keyed.map((row) => row.key) } }, select: { id: true, key: true } }),
    prisma.boardTicket.findMany({ where: { projectKey, id: { in: keyed.map((row) => row.id) } }, select: { id: true, key: true } }),
  ]);
  const holderOf = new Map(holders.map((row) => [row.key, row.id]));
  const keyOf = new Map(stored.map((row) => [row.id, row.key]));
  for (const row of keyed) {
    const holder = holderOf.get(row.key);
    if (holder !== undefined && holder !== row.id) {
      problems.push(`${row.id}: the key ${row.key} belongs to ticket ${holder}; refused rather than overwritten.`);
    }
    const current = keyOf.get(row.id);
    if (current != null && current !== row.key) problems.push(`${row.id}: its key is ${current}, and a key is never changed.`);
  }
  return problems;
}

/**
 * The one-time move of a client's board, keeping ids, keys and dates.
 *
 * Every plan, memory note and commit message on the client cites ticket ids
 * or keys, and three hundred createdAt/movedAt values mean something; a
 * migration that renumbered would rewrite every reference. Upserts by id so
 * it can be re-run after a failed half. The caps still apply: a row past them
 * is refused by name rather than truncated, and the client trims it first.
 */
export async function importTickets(
  projectKey: string,
  rows: readonly ImportRow[],
): Promise<{ ok: true; imported: number } | { ok: false; problems: string[] }> {
  const problems: string[] = [];
  for (const row of rows) {
    for (const problem of draftProblems({ title: row.title, detail: row.detail, askedBy: row.askedBy, key: row.key })) {
      problems.push(`${row.id}: ${problem}`);
    }
    if ((row.claimedBy ?? "").length > 80) problems.push(`${row.id}: claimedBy is at most 80 characters.`);
  }
  /* An id is global, so an upsert by id would hand another project's row to
     this one, project key and all. Refuse the batch by name instead. */
  const owned = await prisma.boardTicket.findMany({
    where: { id: { in: rows.map((row) => row.id) }, projectKey: { not: projectKey } },
    select: { id: true, projectKey: true },
  });
  problems.push(...foreignIdProblems(owned), ...(await importKeyProblems(projectKey, rows)));
  if (problems.length > 0) return { ok: false, problems };

  let imported = 0;
  for (const row of rows) {
    const data = {
      projectKey,
      ...(row.key != null ? { key: row.key } : {}),
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
    try {
      await prisma.boardTicket.upsert({ where: { id: row.id }, create: { id: row.id, ...data }, update: data });
    } catch (error) {
      if (!keyTaken(error)) throw error;
      return {
        ok: false,
        problems: [`${row.id}: the key ${row.key} was taken by another ticket during this import; ${imported} rows before it were written, and a re-run continues from there.`],
      };
    }
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

/** A setting as the API returns it: the value, and who last wrote it when. */
export type SettingView = { key: string; value: string; setBy: string | null; updatedAt: string };

const SETTING_SELECT = { key: true, value: true, setBy: true, updatedAt: true } as const;

function settingView(row: { key: string; value: string; setBy: string | null; updatedAt: Date }): SettingView {
  return { key: row.key, value: row.value, setBy: row.setBy, updatedAt: row.updatedAt.toISOString() };
}

export async function listSettings(projectKey: string): Promise<SettingView[]> {
  const rows = await prisma.boardSetting.findMany({ where: { projectKey }, select: SETTING_SELECT, orderBy: { key: "asc" } });
  return rows.map(settingView);
}

export async function getSetting(projectKey: string, key: string): Promise<SettingView | null> {
  const row = await prisma.boardSetting.findUnique({ where: { projectKey_key: { projectKey, key } }, select: SETTING_SELECT });
  return row ? settingView(row) : null;
}

export async function setSetting(projectKey: string, key: string, value: string, actor: string): Promise<SettingView> {
  const row = await prisma.boardSetting.upsert({
    where: { projectKey_key: { projectKey, key } },
    create: { projectKey, key, value, setBy: actor },
    update: { value, setBy: actor },
    select: SETTING_SELECT,
  });
  return settingView(row);
}

/** True when a row was there to remove; a missing row is already the default. */
export async function deleteSetting(projectKey: string, key: string): Promise<boolean> {
  const removed = await prisma.boardSetting.deleteMany({ where: { projectKey, key } });
  return removed.count === 1;
}
