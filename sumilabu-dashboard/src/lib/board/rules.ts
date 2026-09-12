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
} as const;

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

/** Invariant 6, in words a person can act on. */
export function draftProblems(draft: { title: string; detail?: string | null; askedBy?: string | null }): string[] {
  const problems: string[] = [];
  const title = draft.title.trim();
  if (title.length < TICKET_LIMITS.titleMin) problems.push(`Say what is wanted in at least ${TICKET_LIMITS.titleMin} characters.`);
  if (title.length > TICKET_LIMITS.title) problems.push(`A title is at most ${TICKET_LIMITS.title} characters; the rest belongs in the detail.`);
  if ((draft.detail ?? "").length > TICKET_LIMITS.detail) problems.push(`The detail is at most ${TICKET_LIMITS.detail.toLocaleString("en-US")} characters.`);
  if ((draft.askedBy ?? "").trim().length > TICKET_LIMITS.askedBy) problems.push(`A name is at most ${TICKET_LIMITS.askedBy} characters.`);
  return problems;
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
