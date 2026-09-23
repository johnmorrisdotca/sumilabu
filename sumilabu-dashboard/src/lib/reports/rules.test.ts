import { describe, expect, it } from "vitest";

import {
  FILEABLE_FROM,
  REPORT_LIMITS,
  REPORT_MOVES,
  REPORT_PATCH_TARGETS,
  REPORT_RATE_LIMITS,
  REPORT_STATUSES,
  adminNoteProblems,
  canPatchMove,
  draftProblems,
  isReportStatus,
} from "./rules";

/**
 * The reports gate: this suite is what `REPORTS_CONTRACT.md` is checked
 * against, the way `rules.test.ts` is the board gate for tickets.
 */
describe("the reports gate", () => {
  it("reaches read and closed by PATCH, and filed by neither", () => {
    expect(REPORT_PATCH_TARGETS).toEqual(["read", "closed"]);
    expect(REPORT_PATCH_TARGETS).not.toContain("filed");
  });

  it("makes closed terminal", () => {
    expect(REPORT_MOVES.closed).toEqual([]);
  });

  it("lets new go to read or closed, and read go only to closed", () => {
    expect(canPatchMove("new", "read")).toBe(true);
    expect(canPatchMove("new", "closed")).toBe(true);
    expect(canPatchMove("read", "closed")).toBe(true);
    expect(canPatchMove("read", "read" as never)).toBe(false);
  });

  it("never lets a PATCH move back out of closed", () => {
    for (const target of REPORT_PATCH_TARGETS) expect(canPatchMove("closed", target)).toBe(false);
  });

  it("files only from new or read, never from filed or closed", () => {
    expect(FILEABLE_FROM).toEqual(["new", "read"]);
  });

  it("recognizes every canonical status and nothing else", () => {
    for (const status of REPORT_STATUSES) expect(isReportStatus(status)).toBe(true);
    expect(isReportStatus("open")).toBe(false);
    expect(isReportStatus(42)).toBe(false);
  });

  it("holds the caps the contract names", () => {
    expect(REPORT_LIMITS).toMatchObject({ bodyMin: 3, body: 4000, path: 500, appVersion: 40, reporterRef: 200, reporterName: 80, adminNote: 4000 });
  });

  it("holds the rate limits the contract names", () => {
    expect(REPORT_RATE_LIMITS.perReporter).toEqual({ max: 5, windowMs: 10 * 60 * 1000 });
    expect(REPORT_RATE_LIMITS.perProject).toEqual({ max: 200, windowMs: 60 * 60 * 1000 });
  });
});

describe("draftProblems", () => {
  const valid = { body: "The map does not load on a phone.", reporterRef: "ref-1" };

  it("accepts a valid draft", () => {
    expect(draftProblems(valid)).toEqual([]);
  });

  it("refuses a body under the minimum, in words", () => {
    expect(draftProblems({ ...valid, body: "ab" })).toEqual(["Say what happened in at least 3 characters."]);
  });

  it("refuses a body over the cap", () => {
    expect(draftProblems({ ...valid, body: "x".repeat(REPORT_LIMITS.body + 1) })).toHaveLength(1);
  });

  it("requires a reporter ref", () => {
    expect(draftProblems({ ...valid, reporterRef: "" })).toContain("A reporter ref is required.");
    expect(draftProblems({ ...valid, reporterRef: "   " })).toContain("A reporter ref is required.");
  });

  it("accepts a report with no path, version or name", () => {
    expect(draftProblems({ body: "Something broke", reporterRef: "ref-2", path: null, appVersion: null, reporterName: null })).toEqual([]);
  });

  it("refuses a path, version or name over its own cap", () => {
    expect(draftProblems({ ...valid, path: "x".repeat(REPORT_LIMITS.path + 1) })).toHaveLength(1);
    expect(draftProblems({ ...valid, appVersion: "x".repeat(REPORT_LIMITS.appVersion + 1) })).toHaveLength(1);
    expect(draftProblems({ ...valid, reporterName: "x".repeat(REPORT_LIMITS.reporterName + 1) })).toHaveLength(1);
  });
});

describe("adminNoteProblems", () => {
  it("allows null, empty or a short note", () => {
    expect(adminNoteProblems(null)).toEqual([]);
    expect(adminNoteProblems(undefined)).toEqual([]);
    expect(adminNoteProblems("Looked into it.")).toEqual([]);
  });

  it("refuses a note over the cap", () => {
    expect(adminNoteProblems("x".repeat(REPORT_LIMITS.adminNote + 1))).toHaveLength(1);
  });
});
