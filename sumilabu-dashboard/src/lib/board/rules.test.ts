import { describe, expect, it } from "vitest";

import {
  LEASE_MS,
  SHIPPABLE_FROM,
  TEXT_EDITABLE_FROM,
  TICKET_EFFORTS,
  TICKET_KINDS,
  TICKET_LIMITS,
  TICKET_MOVES,
  TICKET_MOVE_TARGETS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  SETTING_LIMITS,
  byQuickWin,
  canMove,
  draftProblems,
  foreignIdProblems,
  heldNow,
  isSettingKey,
  keyProblems,
  moveData,
  moveWhere,
  shipData,
  textData,
  textProblems,
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

  it("revises the words of every status but done", () => {
    expect([...TEXT_EDITABLE_FROM]).toEqual(TICKET_STATUSES.filter((status) => status !== "done"));
  });

  it("holds the caps the contract names", () => {
    expect(TICKET_LIMITS).toMatchObject({ titleMin: 8, title: 120, detail: 4000, askedBy: 60, claimedBy: 80, key: 80 });
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

/*
 * Settings: a key every client can spell without escaping, and a cap that
 * equals the column's. An import refuses another project's ids by name, so
 * an upsert by id can never move a row across projects.
 */
describe("settings and import", () => {
  it("accepts the key shape and nothing else", () => {
    expect(isSettingKey("signup_mode")).toBe(true);
    expect(isSettingKey("leaderboard.ranking_weights")).toBe(true);
    expect(isSettingKey("sources.showcase.kanjivg")).toBe(true);
    expect(isSettingKey("leaderboard.rankingWeights")).toBe(false);
    expect(isSettingKey("sources:showcase:x")).toBe(false);
    expect(isSettingKey("")).toBe(false);
    expect(isSettingKey("k".repeat(SETTING_LIMITS.key + 1))).toBe(false);
  });

  it("names the settings caps", () => {
    expect(SETTING_LIMITS).toEqual({ key: 80, value: 4000 });
  });

  it("refuses an import that would take another project's rows", () => {
    expect(foreignIdProblems([])).toEqual([]);
    expect(foreignIdProblems([{ id: "abc", projectKey: "itsutsu" }])).toEqual(["abc: already belongs to project itsutsu."]);
  });
});

/* Invariants 11 and 12: a key is a kebab slug written once; words are revised under the draft's caps. */
describe("keys and revisions", () => {
  it("accepts a kebab slug up to the cap and nothing else", () => {
    expect(keyProblems("its-xp-history")).toEqual([]);
    expect(keyProblems("0-196-0")).toEqual([]);
    expect(keyProblems("k".repeat(TICKET_LIMITS.key))).toEqual([]);
    for (const bad of ["", "Its-xp", "its_xp", "its--xp", "-its", "its-", "its xp", "k".repeat(TICKET_LIMITS.key + 1)]) {
      expect(keyProblems(bad), bad).toHaveLength(1);
    }
    expect(draftProblems({ title: "A fine title", key: "Not A Key" })).toHaveLength(1);
    expect(draftProblems({ title: "A fine title", key: null })).toEqual([]);
  });

  it("checks only the words a revision carries, in the draft's own words", () => {
    expect(textProblems({})).toEqual([]);
    expect(textProblems({ detail: null })).toEqual([]);
    expect(textProblems({ title: "short" })).toEqual(draftProblems({ title: "short" }));
    expect(textProblems({ detail: "d".repeat(TICKET_LIMITS.detail + 1) })).toEqual(draftProblems({ title: "A fine title", detail: "d".repeat(TICKET_LIMITS.detail + 1) }));
  });

  it("writes the words it carries with who revised them, and never the status or movedAt", () => {
    const now = new Date("2026-09-14T10:00:00Z");
    expect(textData({ title: "  A fine title  " }, "its-builder", now)).toEqual({ title: "A fine title", editedBy: "its-builder", editedAt: now });
    expect(textData({ detail: "  " }, "its-builder", now)).toEqual({ detail: null, editedBy: "its-builder", editedAt: now });
  });
});
