import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isResponse, moveResponse, readJson, requireCaller } from "@/lib/board/http";
import { TICKET_EFFORTS, TICKET_LIMITS, TICKET_MOVE_TARGETS, TICKET_PRIORITIES, textProblems } from "@/lib/board/rules";
import { getTicket, gradeTicket, moveTicket, reviseTicket, type TicketText } from "@/lib/board/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectKey: string; ticketId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { projectKey, ticketId } = await ctx.params;
  const caller = requireCaller(req, projectKey, false);
  if (isResponse(caller)) return caller;
  const ticket = await getTicket(projectKey, ticketId);
  return ticket ? NextResponse.json({ ok: true, ticket }) : NextResponse.json({ ok: false, error: "missing" }, { status: 404 });
}

/* `done` is not a destination here, whatever a client's UI wants: invariant 1.
   The words are as generous on the wire as a create's, and the contract's caps
   then say which field, in words. */
const patchSchema = z
  .object({
    status: z.enum(TICKET_MOVE_TARGETS).optional(),
    priority: z.enum(TICKET_PRIORITIES).nullable().optional(),
    effort: z.enum(TICKET_EFFORTS).nullable().optional(),
    title: z.string().max(TICKET_LIMITS.title * 4).optional(),
    detail: z.string().max(TICKET_LIMITS.detail * 4).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "Nothing to change." });

/**
 * The words are checked first; then the move, once, carrying the words in
 * the same conditional write, or the words alone; then the grade. A refused
 * check, move or revision returns before any grade is written, so a body
 * carrying several leaves the row where it was. Null for a grade means
 * ungrade; null or empty for a detail clears it; omitted means untouched.
 *
 * A key is refused by name rather than dropped as an unknown field, since
 * silently ignoring it would read as the change having been made: a key is
 * written once, at create or import, and never changed (invariant 11).
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { projectKey, ticketId } = await ctx.params;
  const body = await readJson(req);
  if (body !== null && typeof body === "object" && "key" in body) {
    return NextResponse.json({ ok: false, error: "key_immutable", hint: "A key is written once, at create or import." }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 });
  const { status, priority, effort, title, detail } = parsed.data;
  const text: TicketText | null = title === undefined && detail === undefined ? null : { title, detail };
  const wantsMove = status !== undefined;
  const caller = requireCaller(req, projectKey, wantsMove || text !== null);
  if (isResponse(caller)) return caller;

  if (text) {
    const problems = textProblems(text);
    if (problems.length > 0) return NextResponse.json({ ok: false, error: problems[0], problems }, { status: 422 });
  }
  if (wantsMove) {
    const outcome = await moveTicket(projectKey, ticketId, status, caller.actor!, text ?? undefined);
    if (!outcome.ok) return moveResponse(outcome);
  } else if (text) {
    const outcome = await reviseTicket(projectKey, ticketId, text, caller.actor!);
    if (!outcome.ok) return moveResponse(outcome);
  }
  const ticket = await gradeTicket(projectKey, ticketId, { priority, effort });
  return ticket ? NextResponse.json({ ok: true, ticket }) : NextResponse.json({ ok: false, error: "missing" }, { status: 404 });
}
