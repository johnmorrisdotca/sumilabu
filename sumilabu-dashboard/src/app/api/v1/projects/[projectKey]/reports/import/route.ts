import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { TOKEN_SCOPES } from "@/lib/board/auth";
import { isResponse, readJson, requireCaller } from "@/lib/board/http";
import { REPORT_LIMITS, REPORT_STATUSES } from "@/lib/reports/rules";
import { importReports } from "@/lib/reports/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectKey: string }> };

const iso = z.string().datetime();

const rowSchema = z.object({
  id: z.string().min(1).max(64),
  body: z.string().max(REPORT_LIMITS.body * 4),
  path: z.string().max(REPORT_LIMITS.path * 4).nullable().optional(),
  appVersion: z.string().max(REPORT_LIMITS.appVersion * 4).nullable().optional(),
  reporterRef: z.string().max(REPORT_LIMITS.reporterRef * 4),
  reporterName: z.string().max(REPORT_LIMITS.reporterName * 4).nullable().optional(),
  status: z.enum(REPORT_STATUSES),
  filedTicketId: z.string().max(64).nullable().optional(),
  adminNote: z.string().max(REPORT_LIMITS.adminNote * 4).nullable().optional(),
  createdAt: iso,
});

const importSchema = z.object({ reports: z.array(rowSchema).min(1).max(1000) });

/**
 * A client's existing reports table, brought over with ids and `createdAt`
 * intact - the one-time move, the same shape `tickets/import` already is.
 * Takes the reports token: a migration writes reports, not board tickets.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { projectKey } = await ctx.params;
  const caller = requireCaller(req, projectKey, true, TOKEN_SCOPES.reports);
  if (isResponse(caller)) return caller;
  const parsed = importSchema.safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 });
  const rows = parsed.data.reports.map((row) => ({ ...row, createdAt: new Date(row.createdAt) }));
  const outcome = await importReports(projectKey, rows);
  if (!outcome.ok) return NextResponse.json({ ok: false, error: outcome.problems[0], problems: outcome.problems }, { status: 422 });
  return NextResponse.json({ ok: true, imported: outcome.imported });
}
