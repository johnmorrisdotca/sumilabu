import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isResponse, patchResponse, readJson, requireCaller } from "@/lib/board/http";
import { TICKET_EFFORTS, TICKET_KINDS, TICKET_LIMITS, TICKET_MOVE_TARGETS, TICKET_PRIORITIES } from "@/lib/board/rules";
import { getTicket, patchTicket } from "@/lib/board/server";

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
    area: z.string().max(TICKET_LIMITS.area * 4).nullable().optional(),
    askedBy: z.string().max(TICKET_LIMITS.askedBy * 4).nullable().optional(),
    kind: z.enum(TICKET_KINDS).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "Nothing to change." });

const NEEDS_ACTOR_FIELDS = ["title", "detail", "area", "askedBy", "kind"] as const;

/**
 * The words are checked first; then the move, once, carrying the words in
 * the same conditional write, or the words alone; then the grade. A refused
 * check, move or revision returns before any grade is written, so a body
 * carrying several leaves the row where it was. Null for a grade means
 * ungrade; null or empty for a detail/area/askedBy clears it; omitted means
 * untouched.
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
  const { status, priority, effort, ...text } = parsed.data;
  const needsActor = status !== undefined || NEEDS_ACTOR_FIELDS.some((field) => text[field] !== undefined);
  const caller = requireCaller(req, projectKey, needsActor);
  if (isResponse(caller)) return caller;

  const outcome = await patchTicket(projectKey, ticketId, { status, priority, effort, ...text }, caller.actor ?? "");
  return patchResponse(outcome);
}
