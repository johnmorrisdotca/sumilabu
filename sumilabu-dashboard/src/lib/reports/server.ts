import { prisma } from "@/lib/prisma";
import { draftProblems as ticketDraftProblems, type TicketKind } from "@/lib/board/rules";

import {
  FILEABLE_FROM,
  REPORT_RATE_LIMITS,
  adminNoteProblems,
  canPatchMove,
  draftProblems,
  isReportStatus,
  type RateLimitScope,
  type ReportDraft,
  type ReportPatchTarget,
  type ReportStatus,
} from "./rules";

export type ReportView = {
  id: string;
  projectKey: string;
  body: string;
  path: string | null;
  appVersion: string | null;
  reporterRef: string;
  reporterName: string | null;
  status: ReportStatus;
  filedTicketId: string | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string; projectKey: string; body: string; path: string | null; appVersion: string | null; reporterRef: string;
  reporterName: string | null; status: string; filedTicketId: string | null; adminNote: string | null; createdAt: Date; updatedAt: Date;
};

function view(row: Row): ReportView {
  return {
    ...row,
    status: isReportStatus(row.status) ? row.status : "new",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** `?status=new,read`, most recent first, offset-paged - reports are a low-volume table, so a simple offset is enough. */
export type ListFilter = { statuses?: readonly ReportStatus[]; limit?: number; offset?: number };

export async function listReports(projectKey: string, filter: ListFilter = {}): Promise<ReportView[]> {
  const limit = Math.min(Math.max(filter.limit ?? 25, 1), 100);
  const offset = Math.max(filter.offset ?? 0, 0);
  const rows = await prisma.report.findMany({
    where: { projectKey, ...(filter.statuses && filter.statuses.length > 0 ? { status: { in: [...filter.statuses] } } : {}) },
    orderBy: { createdAt: "desc" },
  });
  return (rows as Row[]).slice(offset, offset + limit).map(view);
}

export async function getReport(projectKey: string, id: string): Promise<ReportView | null> {
  const row = await prisma.report.findFirst({ where: { id, projectKey } });
  return row ? view(row as Row) : null;
}

/**
 * Whether a create would go over the reporter's or the project's window,
 * counted against the `Report` table itself. Checked before a create so a
 * refused report is never written; the reporter's own count is the tighter
 * limit in practice, but a project can also be hammered by many reporters.
 */
export async function rateLimited(projectKey: string, reporterRef: string): Promise<{ limited: false } | { limited: true; scope: RateLimitScope; retryAfterMs: number }> {
  const now = Date.now();
  const reporterSince = new Date(now - REPORT_RATE_LIMITS.perReporter.windowMs);
  const reporterCount = await prisma.report.count({ where: { projectKey, reporterRef, createdAt: { gt: reporterSince } } });
  if (reporterCount >= REPORT_RATE_LIMITS.perReporter.max) {
    return { limited: true, scope: "reporter", retryAfterMs: REPORT_RATE_LIMITS.perReporter.windowMs };
  }
  const projectSince = new Date(now - REPORT_RATE_LIMITS.perProject.windowMs);
  const projectCount = await prisma.report.count({ where: { projectKey, createdAt: { gt: projectSince } } });
  if (projectCount >= REPORT_RATE_LIMITS.perProject.max) {
    return { limited: true, scope: "project", retryAfterMs: REPORT_RATE_LIMITS.perProject.windowMs };
  }
  return { limited: false };
}

export type CreateOutcome =
  | { ok: true; report: ReportView }
  | { ok: false; reason: "invalid"; problems: string[] }
  | { ok: false; reason: "rate_limited"; scope: RateLimitScope; retryAfterMs: number };

export async function createReport(projectKey: string, draft: ReportDraft): Promise<CreateOutcome> {
  const problems = draftProblems(draft);
  if (problems.length > 0) return { ok: false, reason: "invalid", problems };
  const limit = await rateLimited(projectKey, draft.reporterRef.trim());
  if (limit.limited) return { ok: false, reason: "rate_limited", scope: limit.scope, retryAfterMs: limit.retryAfterMs };
  const row = await prisma.report.create({
    data: {
      projectKey,
      body: draft.body.trim(),
      path: draft.path?.trim() || null,
      appVersion: draft.appVersion?.trim() || null,
      reporterRef: draft.reporterRef.trim(),
      reporterName: draft.reporterName?.trim() || null,
    },
  });
  return { ok: true, report: view(row as Row) };
}

export type ReportPatch = { status?: ReportPatchTarget; adminNote?: string | null };

export type PatchOutcome =
  | { ok: true; report: ReportView }
  | { ok: false; reason: "invalid"; problems: string[] }
  | { ok: false; reason: "missing" | "illegal"; report: ReportView | null };

/**
 * A status move (`new`->`read`, any of `new`/`read`/`filed`->`closed`) and an
 * admin note in one write; `filed` is refused here, 400, before any write -
 * it is reached only by `POST reports/{id}/file`.
 */
export async function patchReport(projectKey: string, id: string, patch: ReportPatch): Promise<PatchOutcome> {
  const noteProblems = patch.adminNote !== undefined ? adminNoteProblems(patch.adminNote) : [];
  if (noteProblems.length > 0) return { ok: false, reason: "invalid", problems: noteProblems };

  const before = await prisma.report.findFirst({ where: { id, projectKey } });
  if (!before) return { ok: false, reason: "missing", report: null };
  const row = before as Row;
  if (patch.status !== undefined && !canPatchMove(isReportStatus(row.status) ? row.status : "new", patch.status)) {
    return { ok: false, reason: "illegal", report: view(row) };
  }

  const data: Record<string, unknown> = {};
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.adminNote !== undefined) data.adminNote = patch.adminNote?.trim() || null;
  if (Object.keys(data).length === 0) return { ok: true, report: view(row) };

  await prisma.report.updateMany({ where: { id, projectKey }, data });
  const after = await getReport(projectKey, id);
  return after ? { ok: true, report: after } : { ok: false, reason: "missing", report: null };
}

export async function deleteReport(projectKey: string, id: string): Promise<boolean> {
  const removed = await prisma.report.deleteMany({ where: { id, projectKey } });
  return removed.count === 1;
}

/** What `POST reports/{id}/file` may override; unfilled fields are derived from the report. */
export type FileOverrides = { title?: string; detail?: string; kind?: TicketKind };

function summarize(body: string, max: number): string {
  const trimmed = body.trim().replace(/\s+/g, " ");
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

/** The board ticket a report files as, when the caller sends no override. */
function derivedDraft(row: Row, overrides: FileOverrides | undefined) {
  const title = overrides?.title ?? `Report: ${summarize(row.body, 110)}`.padEnd(8, ".");
  const metaLines = [
    row.path ? `Page: ${row.path}` : null,
    row.appVersion ? `Version: ${row.appVersion}` : null,
    row.reporterName ? `From: ${row.reporterName}` : `Reporter ref: ${row.reporterRef}`,
  ].filter((line): line is string => line != null);
  const detail = overrides?.detail ?? [row.body.trim(), "", ...metaLines].join("\n");
  return { title, detail, kind: overrides?.kind ?? ("fix" as TicketKind), askedBy: row.reporterName ?? null };
}

export type FileOutcome =
  | { ok: true; report: ReportView; ticketId: string }
  | { ok: false; reason: "missing" }
  | { ok: false; reason: "not_fileable"; report: ReportView }
  | { ok: false; reason: "invalid"; problems: string[] };

class NotFileableError extends Error {}

/**
 * Files a report as a board ticket: creates the `BoardTicket` and links it
 * (`status = "filed"`, `filedTicketId`) in one transaction, so a report is
 * never left pointing at a ticket the write failed to create, and a ticket
 * is never created for a report that moved (closed by someone else) between
 * the read and the write.
 */
export async function fileReport(projectKey: string, id: string, overrides: FileOverrides | undefined): Promise<FileOutcome> {
  const before = await prisma.report.findFirst({ where: { id, projectKey } });
  if (!before) return { ok: false, reason: "missing" };
  const row = before as Row;
  const status = isReportStatus(row.status) ? row.status : "new";
  if (!(FILEABLE_FROM as readonly string[]).includes(status)) return { ok: false, reason: "not_fileable", report: view(row) };

  const draft = derivedDraft(row, overrides);
  const problems = ticketDraftProblems(draft);
  if (problems.length > 0) return { ok: false, reason: "invalid", problems };

  try {
    const ticketId = await prisma.$transaction(async (tx) => {
      const ticket = await tx.boardTicket.create({
        data: { projectKey, title: draft.title, detail: draft.detail, kind: draft.kind, askedBy: draft.askedBy },
      });
      const updated = await tx.report.updateMany({
        where: { id, projectKey, status: { in: [...FILEABLE_FROM] } },
        data: { status: "filed", filedTicketId: ticket.id },
      });
      if (updated.count !== 1) throw new NotFileableError();
      return ticket.id as string;
    });
    const after = await getReport(projectKey, id);
    return after ? { ok: true, report: after, ticketId } : { ok: false, reason: "missing" };
  } catch (error) {
    if (error instanceof NotFileableError) {
      const after = await getReport(projectKey, id);
      return after ? { ok: false, reason: "not_fileable", report: after } : { ok: false, reason: "missing" };
    }
    throw error;
  }
}
