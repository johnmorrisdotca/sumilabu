import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { TOKEN_SCOPES } from "@/lib/board/auth";
import { isResponse, readJson, requireCaller } from "@/lib/board/http";
import { TICKET_KINDS, TICKET_LIMITS } from "@/lib/board/rules";
import { fileResponse } from "@/lib/reports/http";
import { fileReport } from "@/lib/reports/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectKey: string; id: string }> };

const fileSchema = z.object({
  title: z.string().max(TICKET_LIMITS.title * 4).optional(),
  detail: z.string().max(TICKET_LIMITS.detail * 4).optional(),
  kind: z.enum(TICKET_KINDS).optional(),
});

/**
 * Creates the board ticket and links it to this report - `status = "filed"`,
 * `filedTicketId` - in one transaction (`fileReport`), so a failed link never
 * leaves an orphan ticket and a report already filed or closed never gets a
 * second one. Deliberately the board token, not the reports token: filing
 * *is* creating a board ticket, so a leaked reports key must not be able to
 * do this.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { projectKey, id } = await ctx.params;
  const caller = requireCaller(req, projectKey, true, TOKEN_SCOPES.board);
  if (isResponse(caller)) return caller;
  const parsed = fileSchema.safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 });
  const outcome = await fileReport(projectKey, id, parsed.data);
  return fileResponse(outcome);
}
