import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { TOKEN_SCOPES } from "@/lib/board/auth";
import { isResponse, readJson, requireCaller } from "@/lib/board/http";
import { createResponse } from "@/lib/reports/http";
import { REPORT_LIMITS, REPORT_STATUSES, isReportStatus, type ReportStatus } from "@/lib/reports/rules";
import { createReport, listReports } from "@/lib/reports/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectKey: string }> };

/**
 * This project's reports, newest first. `?status=new,read` narrows by
 * canonical status (unknown words are refused rather than ignored, the same
 * choice `tickets` makes); `?limit=`/`?offset=` page it - reports are a
 * low-volume table, so an offset is enough and a keyset cursor would be
 * unused complexity.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { projectKey } = await ctx.params;
  const caller = requireCaller(req, projectKey, false, TOKEN_SCOPES.reports);
  if (isResponse(caller)) return caller;
  const url = new URL(req.url);
  const wanted = (url.searchParams.get("status") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const bad = wanted.filter((s) => !isReportStatus(s));
  if (bad.length > 0) return NextResponse.json({ ok: false, error: "invalid_status", details: bad, valid: REPORT_STATUSES }, { status: 400 });
  const limit = Number(url.searchParams.get("limit") ?? "25");
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const reports = await listReports(projectKey, {
    statuses: wanted as ReportStatus[],
    limit: Number.isFinite(limit) ? limit : undefined,
    offset: Number.isFinite(offset) ? offset : undefined,
  });
  return NextResponse.json({ ok: true, api_version: "v1", reports });
}

/* Generous on the wire so a long body is refused before it is read as a
   draft; the contract's caps then say which field, in words. */
const createSchema = z.object({
  body: z.string().max(REPORT_LIMITS.body * 4),
  path: z.string().max(REPORT_LIMITS.path * 4).nullable().optional(),
  appVersion: z.string().max(REPORT_LIMITS.appVersion * 4).nullable().optional(),
  reporterRef: z.string().max(REPORT_LIMITS.reporterRef * 4),
  reporterName: z.string().max(REPORT_LIMITS.reporterName * 4).nullable().optional(),
});

/**
 * A member's own report, signed in or not - `reporterRef` is required on
 * every create, an opaque id the client mints, never an email or an IP.
 * Rate-limited per reporter and per project before anything is written
 * (`createReport`); a refusal is 429 with the scope and a Retry-After.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { projectKey } = await ctx.params;
  const caller = requireCaller(req, projectKey, false, TOKEN_SCOPES.reports);
  if (isResponse(caller)) return caller;
  const parsed = createSchema.safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 });
  const outcome = await createReport(projectKey, parsed.data);
  return createResponse(outcome);
}
