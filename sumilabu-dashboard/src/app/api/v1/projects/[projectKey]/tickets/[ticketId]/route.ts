import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isResponse, moveResponse, readJson, requireCaller } from "@/lib/board/http";
import { TICKET_EFFORTS, TICKET_MOVE_TARGETS, TICKET_PRIORITIES } from "@/lib/board/rules";
import { getTicket, gradeTicket, moveTicket } from "@/lib/board/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectKey: string; ticketId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { projectKey, ticketId } = await ctx.params;
  const caller = requireCaller(req, projectKey, false);
  if (isResponse(caller)) return caller;
  const ticket = await getTicket(projectKey, ticketId);
  return ticket ? NextResponse.json({ ok: true, ticket }) : NextResponse.json({ ok: false, error: "missing" }, { status: 404 });
}

/* `done` is not a destination here, whatever a client's UI wants: invariant 1. */
const patchSchema = z
  .object({
    status: z.enum(TICKET_MOVE_TARGETS).optional(),
    priority: z.enum(TICKET_PRIORITIES).nullable().optional(),
    effort: z.enum(TICKET_EFFORTS).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "Nothing to change." });

/**
 * The move first and only once; then the grade. A refused move returns
 * before any grade is written, so a body carrying both leaves the row where
 * it was. Null for a grade means ungrade; omitted means untouched.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { projectKey, ticketId } = await ctx.params;
  const parsed = patchSchema.safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 });
  const wantsMove = parsed.data.status !== undefined;
  const caller = requireCaller(req, projectKey, wantsMove);
  if (isResponse(caller)) return caller;

  if (wantsMove) {
    const outcome = await moveTicket(projectKey, ticketId, parsed.data.status!, caller.actor!);
    if (!outcome.ok) return moveResponse(outcome);
  }
  const ticket = await gradeTicket(projectKey, ticketId, { priority: parsed.data.priority, effort: parsed.data.effort });
  return ticket ? NextResponse.json({ ok: true, ticket }) : NextResponse.json({ ok: false, error: "missing" }, { status: 404 });
}
