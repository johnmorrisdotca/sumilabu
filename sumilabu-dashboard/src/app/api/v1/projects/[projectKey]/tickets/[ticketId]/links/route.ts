import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isResponse, readJson, requireCaller } from "@/lib/board/http";
import { addTicketLink } from "@/lib/board/links";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectKey: string; ticketId: string }> };

const linkSchema = z.object({ otherId: z.string().min(1).max(64) });

/**
 * Invariant 18. Links this ticket to another of the same project, named by
 * short id or cuid. A write, so it names its actor, and allowed on a ticket in
 * any status. 201 when the link is new, 200 when the pair was already linked;
 * 422 for itself, a ticket that is not this project's, or one nobody holds.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { projectKey, ticketId } = await ctx.params;
  const caller = requireCaller(req, projectKey, true);
  if (isResponse(caller)) return caller;
  const parsed = linkSchema.safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 });

  const outcome = await addTicketLink(projectKey, ticketId, parsed.data.otherId, caller.actor ?? "");
  if (outcome.ok) return NextResponse.json({ ok: true, created: outcome.created, related: outcome.related }, { status: outcome.created ? 201 : 200 });
  if (outcome.reason === "invalid") return NextResponse.json({ ok: false, error: outcome.problems[0], problems: outcome.problems }, { status: 422 });
  return NextResponse.json({ ok: false, error: "missing" }, { status: 404 });
}
