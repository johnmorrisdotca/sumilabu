import { describe, expect, it } from "vitest";

import {
  LEASE_MS,
  SHIPPABLE_FROM,
  TICKET_EFFORTS,
  TICKET_KINDS,
  TICKET_LIMITS,
  TICKET_MOVES,
  TICKET_MOVE_TARGETS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  byQuickWin,
  canMove,
  draftProblems,
  heldNow,
  moveData,
  moveWhere,
  shipData,
} from "./rules";

/**
 * Invariant 10: the board gate. If a change here fails, either
 * BOARD_RULES.md changed or the code did, and the test names which.
 */
describe("the board gate", () => {
  it("lets every status but done be left, and makes done terminal", () => {
    for (const status of TICKET_STATUSES) {
      if (status === "done") expect(TICKET_MOVES.done).toEqual([]);
      else expect(TICKET_MOVES[status].length).toBeGreaterThan(0);
    }
  });

  it("reaches every status but done by a move, and done by no move at all", () => {
    const reachable = new Set(Object.values(TICKET_MOVES).flat());
    for (const status of TICKET_STATUSES) {
      expect(reachable.has(status as never)).toBe(status !== "done");
    }
    expect(TICKET_MOVE_TARGETS).not.toContain("done");
  });

  it("lets a release tool ship a ticket that was never claimed, and never from done", () => {
    expect(SHIPPABLE_FROM).toEqual(["open", "inProgress"]);
    expect(SHIPPABLE_FROM).not.toContain("done");
  });

  it("holds the caps the contract names", () => {
    expect(TICKET_LIMITS).toMatchObject({ titleMin: 8, title: 120, detail: 4000, askedBy: 60, claimedBy: 80 });
    expect(LEASE_MS).toBe(6 * 60 * 60 * 1000);
  });

  it("keeps the vocabulary the two clients map to", () => {
    expect(TICKET_STATUSES).toEqual(["open", "inProgress", "done", "dropped"]);
    expect(TICKET_KINDS).toEqual(["feature", "fix", "chore"]);
    expect(TICKET_PRIORITIES).toEqual(["high", "normal", "low"]);
    expect(TICKET_EFFORTS).toEqual(["small", "medium", "large"]);
  });
});

describe("moves", () => {
  it("answers only from the table", () => {
    expect(canMove("open", "inProgress")).toBe(true);
    expect(canMove("dropped", "open")).toBe(true);
    expect(canMove("open", "open")).toBe(false);
    expect(canMove("done", "open")).toBe(false);
  });

  it("writes the claim with the status, never the status alone", () => {
    const now = new Date("2026-09-12T10:00:00Z");
    expect(moveData("inProgress", "umakuma-4d", now)).toEqual({ status: "inProgress", claimedBy: "umakuma-4d", claimedAt: now, movedAt: now });
    expect(moveData("open", "umakuma-4d", now)).toEqual({ status: "open", claimedBy: null, claimedAt: null, movedAt: now });
    expect(shipData("1.130.0", "entry-1", now)).toMatchObject({ status: "done", claimedBy: null, releasedIn: "1.130.0", releasedEntry: "entry-1", releasedAt: now });
  });

  it("carries the conditional where every moving write needs", () => {
    const now = new Date("2026-09-12T10:00:00Z");
    const where = moveWhere("t1", "umakuma", "open", "me", now);
    expect(where).toMatchObject({ id: "t1", projectKey: "umakuma", status: "open" });
    expect(where.OR).toEqual([{ claimedBy: null }, { claimedBy: "me" }, { claimedAt: { lt: new Date(now.getTime() - LEASE_MS) } }]);
  });
});

describe("the lease", () => {
  const now = Date.parse("2026-09-12T10:00:00Z");
  it("holds inside six hours and lapses after", () => {
    expect(heldNow({ claimedBy: "a", claimedAt: new Date(now - LEASE_MS) }, now)).toBe(true);
    expect(heldNow({ claimedBy: "a", claimedAt: new Date(now - LEASE_MS - 1) }, now)).toBe(false);
    expect(heldNow({ claimedBy: null, claimedAt: new Date(now) }, now)).toBe(false);
    expect(heldNow({ claimedBy: "  ", claimedAt: new Date(now) }, now)).toBe(false);
  });
});

describe("drafts and ordering", () => {
  it("refuses in words a person can act on", () => {
    expect(draftProblems({ title: "short" })).toHaveLength(1);
    expect(draftProblems({ title: "x".repeat(121) })).toHaveLength(1);
    expect(draftProblems({ title: "A fine title", detail: "d".repeat(4001) })).toHaveLength(1);
    expect(draftProblems({ title: "A fine title", askedBy: "n".repeat(61) })).toHaveLength(1);
    expect(draftProblems({ title: "A fine title", detail: "ok", askedBy: "John" })).toEqual([]);
  });

  it("sorts quick wins with ungraded last on both axes", () => {
    const at = (iso: string) => new Date(iso);
    const rows = [
      { id: "ungraded", priority: null, effort: null, movedAt: at("2026-09-12T00:00:00Z") },
      { id: "high-large", priority: "high" as const, effort: "large" as const, movedAt: at("2026-09-10T00:00:00Z") },
      { id: "high-small", priority: "high" as const, effort: "small" as const, movedAt: at("2026-09-01T00:00:00Z") },
      { id: "low-small", priority: "low" as const, effort: "small" as const, movedAt: at("2026-09-11T00:00:00Z") },
    ];
    expect([...rows].sort(byQuickWin).map((r) => r.id)).toEqual(["high-small", "high-large", "low-small", "ungraded"]);
  });
});
