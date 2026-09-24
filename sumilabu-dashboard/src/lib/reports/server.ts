import { prisma } from "@/lib/prisma";
import { draftProblems as ticketDraftProblems, type TicketKind } from "@/lib/board/rules";

import { REPORT_IMAGE_BUDGETS, decodeReportImage, type ReportImageType } from "./image";
import {
  FILEABLE_FROM,
  REPORT_RATE_LIMITS,
  adminNoteProblems,
  canPatchMove,
  draftProblems,
  isReportStatus,
  type RateLimitKind,
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
  /** Whether a screenshot is attached; the bytes are only ever read from `GET reports/{id}/image`. */
  hasImage: boolean;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string; projectKey: string; body: string; path: string | null; appVersion: string | null; reporterRef: string;
  reporterName: string | null; status: string; filedTicketId: string | null; adminNote: string | null; imageBytes?: number | null;
  createdAt: Date; updatedAt: Date;
};

/* Field by field rather than a spread, so a column added to Report is not
   published by accident - `imageBytes` becomes `hasImage` and nothing more. */
function view(row: Row): ReportView {
  return {
    id: row.id,
    projectKey: row.projectKey,
    body: row.body,
    path: row.path,
    appVersion: row.appVersion,
    reporterRef: row.reporterRef,
    reporterName: row.reporterName,
    status: isReportStatus(row.status) ? row.status : "new",
    filedTicketId: row.filedTicketId,
    adminNote: row.adminNote,
    hasImage: row.imageBytes != null,
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
export type RateLimit = { limited: false } | { limited: true; scope: RateLimitScope; limit: RateLimitKind; retryAfterMs: number };

/** Image bytes already sent in the window, from `Report.imageBytes` - never from the images themselves. */
async function imageBytesSince(where: Record<string, unknown>): Promise<number> {
  const rows = await prisma.report.findMany({ where: { ...where, imageBytes: { not: null } }, select: { imageBytes: true } });
  return (rows as { imageBytes: number | null }[]).reduce((sum, row) => sum + (row.imageBytes ?? 0), 0);
}

export async function rateLimited(projectKey: string, reporterRef: string, imageBytes = 0): Promise<RateLimit> {
  const now = Date.now();
  const reporterSince = new Date(now - REPORT_RATE_LIMITS.perReporter.windowMs);
  const reporterCount = await prisma.report.count({ where: { projectKey, reporterRef, createdAt: { gt: reporterSince } } });
  if (reporterCount >= REPORT_RATE_LIMITS.perReporter.max) {
    return { limited: true, scope: "reporter", limit: "reports", retryAfterMs: REPORT_RATE_LIMITS.perReporter.windowMs };
  }
  const projectSince = new Date(now - REPORT_RATE_LIMITS.perProject.windowMs);
  const projectCount = await prisma.report.count({ where: { projectKey, createdAt: { gt: projectSince } } });
  if (projectCount >= REPORT_RATE_LIMITS.perProject.max) {
    return { limited: true, scope: "project", limit: "reports", retryAfterMs: REPORT_RATE_LIMITS.perProject.windowMs };
  }
  if (imageBytes > 0) return imageBudgetExceeded(projectKey, reporterRef, imageBytes, now);
  return { limited: false };
}

/**
 * The byte budget an image is held to on top of the report count
 * (`REPORT_IMAGE_BUDGETS`). Asked only when the create carries an image, so a
 * text-only report costs no extra query.
 */
async function imageBudgetExceeded(projectKey: string, reporterRef: string, imageBytes: number, now: number): Promise<RateLimit> {
  const { perReporter, perProject } = REPORT_IMAGE_BUDGETS;
  const reporterBytes = await imageBytesSince({ projectKey, reporterRef, createdAt: { gt: new Date(now - perReporter.windowMs) } });
  if (reporterBytes + imageBytes > perReporter.maxBytes) {
    return { limited: true, scope: "reporter", limit: "image_bytes", retryAfterMs: perReporter.windowMs };
  }
  const projectBytes = await imageBytesSince({ projectKey, createdAt: { gt: new Date(now - perProject.windowMs) } });
  if (projectBytes + imageBytes > perProject.maxBytes) {
    return { limited: true, scope: "project", limit: "image_bytes", retryAfterMs: perProject.windowMs };
  }
  return { limited: false };
}

export type CreateOutcome =
  | { ok: true; report: ReportView }
  | { ok: false; reason: "invalid"; problems: string[] }
  | { ok: false; reason: "rate_limited"; scope: RateLimitScope; limit: RateLimitKind; retryAfterMs: number };

/**
 * `image`, when given, is plain base64. Its type is read from its bytes and
 * its size checked before anything else is asked, and the report and the
 * image are written in one transaction - a report never claims a screenshot
 * that did not land, and an image never outlives a create that failed.
 */
export async function createReport(projectKey: string, draft: ReportDraft, image?: string | null): Promise<CreateOutcome> {
  const problems = draftProblems(draft);
  const decoded = image ? decodeReportImage(image) : null;
  if (decoded && !decoded.ok) problems.push(decoded.problem);
  if (problems.length > 0) return { ok: false, reason: "invalid", problems };
  const attached = decoded?.ok ? decoded : null;

  const limit = await rateLimited(projectKey, draft.reporterRef.trim(), attached?.bytes.length ?? 0);
  if (limit.limited) return { ok: false, reason: "rate_limited", scope: limit.scope, limit: limit.limit, retryAfterMs: limit.retryAfterMs };
  const data = {
    projectKey,
    body: draft.body.trim(),
    path: draft.path?.trim() || null,
    appVersion: draft.appVersion?.trim() || null,
    reporterRef: draft.reporterRef.trim(),
    reporterName: draft.reporterName?.trim() || null,
    imageBytes: attached ? attached.bytes.length : null,
  };
  const row = attached
    ? await prisma.$transaction(async (tx) => {
        const created = await tx.report.create({ data });
        await tx.reportImage.create({ data: { reportId: created.id, contentType: attached.contentType, bytes: new Uint8Array(attached.bytes) } });
        return created;
      })
    : await prisma.report.create({ data });
  return { ok: true, report: view(row as Row) };
}

export type StoredImage = { contentType: ReportImageType; bytes: Buffer };

/**
 * A report's screenshot, only through the report's own project: the report
 * is found by `id` and `projectKey` first, so a token for one project cannot
 * read another's image by guessing an id.
 */
export async function getReportImage(projectKey: string, id: string): Promise<StoredImage | null> {
  const owner = await prisma.report.findFirst({ where: { id, projectKey }, select: { id: true } });
  if (!owner) return null;
  const image = await prisma.reportImage.findFirst({ where: { reportId: id } });
  if (!image) return null;
  const row = image as { contentType: string; bytes: Uint8Array };
  return { contentType: row.contentType as ReportImageType, bytes: Buffer.from(row.bytes) };
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

/** One row of a client's existing reports table, brought over as it stands. */
export type ReportImportRow = {
  id: string;
  body: string;
  path?: string | null;
  appVersion?: string | null;
  reporterRef: string;
  reporterName?: string | null;
  status: ReportStatus;
  filedTicketId?: string | null;
  adminNote?: string | null;
  createdAt: Date;
};

/**
 * The one-time move of a client's own reports table into this service,
 * keeping ids and `createdAt` - a client that stores `filedTicketId` locally
 * (UmaKuma's `ProblemReport.filedAs`) keeps citing the same id afterwards.
 * Upserts by id, so a run that failed half way is re-run rather than
 * reconciled; `updatedAt` is not carried across (the board's own import does
 * the same with `BoardTicket.updatedAt`) since nothing reads it as history,
 * only as "was this row touched since I last looked."
 *
 * An id already owned by a different project refuses the whole batch by
 * name, before anything is written - ids are global, and an upsert would
 * otherwise hand that project's row to this one.
 */
export async function importReports(
  projectKey: string,
  rows: readonly ReportImportRow[],
): Promise<{ ok: true; imported: number } | { ok: false; problems: string[] }> {
  const problems: string[] = [];
  for (const row of rows) {
    for (const problem of draftProblems({ body: row.body, reporterRef: row.reporterRef, path: row.path, appVersion: row.appVersion, reporterName: row.reporterName })) {
      problems.push(`${row.id}: ${problem}`);
    }
    problems.push(...adminNoteProblems(row.adminNote).map((problem) => `${row.id}: ${problem}`));
  }
  const owned = await prisma.report.findMany({
    where: { id: { in: rows.map((row) => row.id) }, projectKey: { not: projectKey } },
    select: { id: true, projectKey: true },
  });
  problems.push(...owned.map((row) => `${row.id}: already belongs to project ${row.projectKey}.`));
  if (problems.length > 0) return { ok: false, problems };

  let imported = 0;
  for (const row of rows) {
    const data = {
      projectKey,
      body: row.body.trim(),
      path: row.path ?? null,
      appVersion: row.appVersion ?? null,
      reporterRef: row.reporterRef,
      reporterName: row.reporterName ?? null,
      status: row.status,
      filedTicketId: row.filedTicketId ?? null,
      adminNote: row.adminNote ?? null,
      createdAt: row.createdAt,
    };
    await prisma.report.upsert({ where: { id: row.id }, create: { id: row.id, ...data }, update: data });
    imported += 1;
  }
  return { ok: true, imported };
}
