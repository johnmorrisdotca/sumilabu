/**
 * The reports contract, as code. `docs/board/REPORTS_CONTRACT.md` is the
 * document; this file is what the routes ask - the same split `board/rules.ts`
 * keeps for tickets. Nothing here touches a database.
 */

export const REPORT_STATUSES = ["new", "read", "filed", "closed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/**
 * What `PATCH` may move to. `filed` is written only by
 * `POST reports/{id}/file`, together with `filedTicketId` - the same shape
 * as `done` being unreachable from `PATCH tickets/{id}` and reserved for the
 * ship route.
 */
export const REPORT_PATCH_TARGETS = ["read", "closed"] as const;
export type ReportPatchTarget = (typeof REPORT_PATCH_TARGETS)[number];

export const REPORT_MOVES: Record<ReportStatus, readonly ReportPatchTarget[]> = {
  new: ["read", "closed"],
  read: ["closed"],
  filed: ["closed"],
  closed: [],
};

export function canPatchMove(from: ReportStatus, to: ReportPatchTarget): boolean {
  return REPORT_MOVES[from].includes(to);
}

/** Filing is its own move, not reachable through `canPatchMove`: from `new` or `read` only. */
export const FILEABLE_FROM = ["new", "read"] as const satisfies readonly ReportStatus[];

export function isReportStatus(value: unknown): value is ReportStatus {
  return typeof value === "string" && (REPORT_STATUSES as readonly string[]).includes(value);
}

/** Caps live here and as `@db.VarChar` on `Report`, for the reason `TICKET_LIMITS` gives: a cap in TypeScript alone is another door. */
export const REPORT_LIMITS = {
  bodyMin: 3,
  body: 4000,
  path: 500,
  appVersion: 40,
  reporterRef: 200,
  reporterName: 80,
  adminNote: 4000,
} as const;

export type ReportDraft = {
  body: string;
  path?: string | null;
  appVersion?: string | null;
  reporterRef: string;
  reporterName?: string | null;
};

/** In words a person can act on, the way `draftProblems` reads for a ticket. */
export function draftProblems(draft: ReportDraft): string[] {
  const problems: string[] = [];
  const body = draft.body.trim();
  if (body.length < REPORT_LIMITS.bodyMin) problems.push(`Say what happened in at least ${REPORT_LIMITS.bodyMin} characters.`);
  if (body.length > REPORT_LIMITS.body) problems.push(`A report is at most ${REPORT_LIMITS.body.toLocaleString("en-US")} characters.`);
  if ((draft.path ?? "").length > REPORT_LIMITS.path) problems.push(`A path is at most ${REPORT_LIMITS.path} characters.`);
  if ((draft.appVersion ?? "").length > REPORT_LIMITS.appVersion) problems.push(`An app version is at most ${REPORT_LIMITS.appVersion} characters.`);
  const reporterRef = draft.reporterRef.trim();
  if (reporterRef.length === 0) problems.push("A reporter ref is required.");
  if (reporterRef.length > REPORT_LIMITS.reporterRef) problems.push(`A reporter ref is at most ${REPORT_LIMITS.reporterRef} characters.`);
  if ((draft.reporterName ?? "").length > REPORT_LIMITS.reporterName) problems.push(`A name is at most ${REPORT_LIMITS.reporterName} characters.`);
  return problems;
}

export function adminNoteProblems(note: string | null | undefined): string[] {
  if (note == null) return [];
  return note.length > REPORT_LIMITS.adminNote ? [`An admin note is at most ${REPORT_LIMITS.adminNote.toLocaleString("en-US")} characters.`] : [];
}

/**
 * Rate limiting, counted against the `Report` table itself rather than a
 * second table: a reporter or a project over the window is a `count` query
 * on the same rows a create already writes, not a database or an in-memory
 * store this account would have to keep hot. John, "No Redis, ever" (global
 * rule) rules that out anyway.
 */
export const REPORT_RATE_LIMITS = {
  perReporter: { max: 5, windowMs: 10 * 60 * 1000 },
  perProject: { max: 200, windowMs: 60 * 60 * 1000 },
} as const;

export type RateLimitScope = "reporter" | "project";
