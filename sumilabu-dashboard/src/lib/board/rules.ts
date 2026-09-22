/**
 * The board contract, as code.
 *
 * `BOARD_RULES.md` is the document; this file is what the routes ask. The
 * invariants are numbered there and cited here, so a test can say which one
 * a change broke. Nothing in this file touches a database: it is the part
 * every client used to carry a copy of, and the reason the board lives in
 * one service is that the copies disagreed within a day of being made.
 */

export const TICKET_STATUSES = ["open", "inProgress", "done", "dropped"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_KINDS = ["feature", "fix", "chore"] as const;
export type TicketKind = (typeof TICKET_KINDS)[number];

export const TICKET_PRIORITIES = ["high", "normal", "low"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_EFFORTS = ["small", "medium", "large"] as const;
export type TicketEffort = (typeof TICKET_EFFORTS)[number];

/** Invariant 6. The database carries the same numbers as @db.VarChar caps. */
export const TICKET_LIMITS = {
  titleMin: 8,
  title: 120,
  detail: 4000,
  askedBy: 60,
  claimedBy: 80,
  releasedIn: 40,
  releasedEntry: 120,
  key: 80,
  /** Not `@db.VarChar` capped (invariant 6 lists only the columns that are); checked here so create and revise agree. */
  area: 80,
} as const;

/**
 * A setting is `key -> value`, both strings; the structure is the client's
 * own JSON inside the value. The key shape is what every client can spell
 * without escaping, and the value cap is the column's `@db.VarChar`.
 */
export const SETTING_LIMITS = { key: 80, value: 4000 } as const;
const SETTING_KEY = /^[a-z0-9_.-]{1,80}$/;

export function isSettingKey(value: string): boolean {
  return SETTING_KEY.test(value) && value.length <= SETTING_LIMITS.key;
}

/**
 * Invariant 11. A client's citable name for a ticket, as Itsutsu cites
 * `its-xp-history`. Optional, unique within a project, and written once: by
 * the time anybody wants a different key the old one is in a commit message,
 * so it is never changed.
 */
export const TICKET_KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function keyProblems(key: string): string[] {
  if (key.length > TICKET_LIMITS.key) return [`A key is at most ${TICKET_LIMITS.key} characters.`];
  if (!TICKET_KEY_PATTERN.test(key)) return ["A key is lower-case letters and digits joined by single hyphens, like its-xp-history."];
  return [];
}

/** Invariant 3. */
export const LEASE_MS = 6 * 60 * 60 * 1000;

/**
 * Invariant 1. The only moves. `done` is terminal and is never a destination
 * of a move: a release tool writes it together with the version, through
 * `shipData`, and the one way back is `unship`, for a stamp that never
 * reached a client's main.
 */
export const TICKET_MOVE_TARGETS = ["open", "inProgress", "dropped"] as const;
export type TicketMoveTarget = (typeof TICKET_MOVE_TARGETS)[number];

export const TICKET_MOVES: Record<TicketStatus, readonly TicketMoveTarget[]> = {
  open: ["inProgress", "dropped"],
  inProgress: ["open", "dropped"],
  done: [],
  dropped: ["open"],
};

export function canMove(from: TicketStatus, to: TicketMoveTarget): boolean {
  return TICKET_MOVES[from].includes(to);
}

export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === "string" && (TICKET_STATUSES as readonly string[]).includes(value);
}

export function leaseExpired(claimedAt: Date | string | null | undefined, nowMs = Date.now()): boolean {
  if (!claimedAt) return true;
  const held = claimedAt instanceof Date ? claimedAt.getTime() : Date.parse(claimedAt);
  return !Number.isFinite(held) || nowMs - held > LEASE_MS;
}

/** Invariant 3. Every "in progress" count and "held by" label reads this, never the status alone. */
export function heldNow(
  row: { claimedBy: string | null; claimedAt?: Date | string | null },
  nowMs = Date.now(),
): boolean {
  return typeof row.claimedBy === "string" && row.claimedBy.trim().length > 0 && !leaseExpired(row.claimedAt ?? null, nowMs);
}

/** Invariant 2. What a move writes. Never the status alone. */
export function moveData(to: TicketMoveTarget, actor: string, now: Date) {
  if (to === "inProgress") return { status: to, claimedBy: actor, claimedAt: now, movedAt: now };
  return { status: to, claimedBy: null, claimedAt: null, movedAt: now };
}

/** Invariant 4. The condition every moving write carries; `count === 0` means re-read and say why. */
export function moveWhere(id: string, projectKey: string, from: TicketStatus, actor: string, now: Date) {
  const staleBefore = new Date(now.getTime() - LEASE_MS);
  return {
    id,
    projectKey,
    status: from,
    OR: [{ claimedBy: null }, { claimedBy: actor }, { claimedAt: { lt: staleBefore } }],
  };
}

/** The statuses a release tool may ship from: a ticket filed and shipped in one pass was never claimed. */
export const SHIPPABLE_FROM = ["open", "inProgress"] as const satisfies readonly TicketStatus[];

/** Invariant 9. What a release tool writes, and only a release tool. */
export function shipData(version: string, entryId: string | null, releasedAt: Date) {
  return {
    status: "done" as const,
    claimedBy: null,
    claimedAt: null,
    releasedIn: version,
    releasedEntry: entryId,
    releasedAt,
    movedAt: releasedAt,
  };
}

/** The one way out of `done`: a stamp that a client's main never saw. */
export function unshipData(now: Date) {
  return { status: "open" as const, claimedBy: null, claimedAt: null, releasedIn: null, releasedEntry: null, releasedAt: null, movedAt: now };
}

function titleProblems(raw: string): string[] {
  const title = raw.trim();
  if (title.length < TICKET_LIMITS.titleMin) return [`Say what is wanted in at least ${TICKET_LIMITS.titleMin} characters.`];
  if (title.length > TICKET_LIMITS.title) return [`A title is at most ${TICKET_LIMITS.title} characters; the rest belongs in the detail.`];
  return [];
}

function detailProblems(detail: string | null | undefined): string[] {
  return (detail ?? "").length > TICKET_LIMITS.detail ? [`The detail is at most ${TICKET_LIMITS.detail.toLocaleString("en-US")} characters.`] : [];
}

/** Invariant 6, in words a person can act on. */
export function draftProblems(draft: { title: string; detail?: string | null; askedBy?: string | null; key?: string | null }): string[] {
  const problems = [...titleProblems(draft.title), ...detailProblems(draft.detail)];
  if ((draft.askedBy ?? "").trim().length > TICKET_LIMITS.askedBy) problems.push(`A name is at most ${TICKET_LIMITS.askedBy} characters.`);
  if (draft.key != null) problems.push(...keyProblems(draft.key));
  return problems;
}

/**
 * An import refuses ids that already belong to another project, by name.
 * Ids are global, so an upsert by id would otherwise hand that project's row
 * to this one, project key and all.
 */
export function foreignIdProblems(owned: readonly { id: string; projectKey: string }[]): string[] {
  return owned.map((row) => `${row.id}: already belongs to project ${row.projectKey}.`);
}

/**
 * Invariant 12. A revision of a ticket's words passes the same caps as a
 * draft, for the fields it carries; an omitted field is not revised. `kind`
 * is checked by the route's enum, not here, the same way a create's `kind`
 * is never a `draftProblems` concern.
 */
export function textProblems(text: { title?: string; detail?: string | null; area?: string | null; askedBy?: string | null }): string[] {
  const problems = [...(text.title === undefined ? [] : titleProblems(text.title)), ...detailProblems(text.detail)];
  if (text.area !== undefined && (text.area ?? "").trim().length > TICKET_LIMITS.area) {
    problems.push(`An area is at most ${TICKET_LIMITS.area} characters.`);
  }
  if (text.askedBy !== undefined && (text.askedBy ?? "").trim().length > TICKET_LIMITS.askedBy) {
    problems.push(`A name is at most ${TICKET_LIMITS.askedBy} characters.`);
  }
  return problems;
}

/**
 * Invariant 12. A `done` row's words are part of the release record, so they
 * are revised only from here; a ticket that shipped under the wrong words
 * gets a new row citing it, the way a regression does.
 */
export const TEXT_EDITABLE_FROM = ["open", "inProgress", "dropped"] as const satisfies readonly TicketStatus[];

/** Invariant 12. What a revision writes: the fields it carries, trimmed as a create trims them, and who wrote them. */
export function textData(
  text: { title?: string; detail?: string | null; area?: string | null; askedBy?: string | null; kind?: TicketKind },
  actor: string,
  now: Date,
) {
  return {
    ...(text.title === undefined ? {} : { title: text.title.trim() }),
    ...(text.detail === undefined ? {} : { detail: text.detail?.trim() || null }),
    ...(text.area === undefined ? {} : { area: text.area?.trim() || null }),
    ...(text.askedBy === undefined ? {} : { askedBy: text.askedBy?.trim() || null }),
    ...(text.kind === undefined ? {} : { kind: text.kind }),
    editedBy: actor,
    editedAt: now,
  };
}

/** Invariant 7. Ungraded sorts last on both axes. */
function rank<T extends string>(order: readonly T[], value: T | null): number {
  return value === null ? order.length : order.indexOf(value);
}

export function byQuickWin(
  a: { priority: TicketPriority | null; effort: TicketEffort | null; movedAt: Date },
  b: { priority: TicketPriority | null; effort: TicketEffort | null; movedAt: Date },
): number {
  return (
    rank(TICKET_PRIORITIES, a.priority) - rank(TICKET_PRIORITIES, b.priority) ||
    rank(TICKET_EFFORTS, a.effort) - rank(TICKET_EFFORTS, b.effort) ||
    b.movedAt.getTime() - a.movedAt.getTime()
  );
}
