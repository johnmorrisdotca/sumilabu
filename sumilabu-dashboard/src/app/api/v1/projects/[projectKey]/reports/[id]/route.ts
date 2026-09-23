import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { TOKEN_SCOPES } from "@/lib/board/auth";
import { isResponse, readJson, requireCaller } from "@/lib/board/http";
import { patchResponse } from "@/lib/reports/http";
import { REPORT_LIMITS, REPORT_PATCH_TARGETS } from "@/lib/reports/rules";
import { deleteReport, getReport, patchReport } from "@/lib/reports/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectKey: string; id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { projectKey, id } = await ctx.params;
  const caller = requireCaller(req, projectKey, false, TOKEN_SCOPES.reports);
  if (isResponse(caller)) return caller;
  const report = await getReport(projectKey, id);
  return report ? NextResponse.json({ ok: true, report }) : NextResponse.json({ ok: false, error: "missing" }, { status: 404 });
}

const patchSchema = z.object({
  status: z.enum(REPORT_PATCH_TARGETS).optional(),
  adminNote: z.string().max(REPORT_LIMITS.adminNote * 4).nullable().optional(),
});

/**
 * A status move (`new`->`read`, or any open status->`closed`) and/or the
 * admin's own note. `status: "filed"` is not offered by this schema - filing
 * creates a board ticket and needs the board token, through
 * `POST reports/{id}/file`.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { projectKey, id } = await ctx.params;
  const caller = requireCaller(req, projectKey, true, TOKEN_SCOPES.reports);
  if (isResponse(caller)) return caller;
  const parsed = patchSchema.safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 });
  const outcome = await patchReport(projectKey, id, parsed.data);
  return patchResponse(outcome);
}

/** A hard delete - for a spurious or spam report, not a resolved one (use `closed` for those). */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { projectKey, id } = await ctx.params;
  const caller = requireCaller(req, projectKey, true, TOKEN_SCOPES.reports);
  if (isResponse(caller)) return caller;
  const deleted = await deleteReport(projectKey, id);
  return deleted ? NextResponse.json({ ok: true, deleted: true }) : NextResponse.json({ ok: false, error: "missing" }, { status: 404 });
}
