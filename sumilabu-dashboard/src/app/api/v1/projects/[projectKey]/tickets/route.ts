import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isResponse, readJson, requireCaller } from "@/lib/board/http";
import { TICKET_KINDS, TICKET_LIMITS, isTicketStatus, keyProblems, type TicketStatus } from "@/lib/board/rules";
import { createTicket, getTicketByKey, listTickets } from "@/lib/board/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectKey: string }> };

/**
 * This project's tickets, with `heldNow` already decided.
 *
 * `?status=open,inProgress` narrows by canonical status; `?unfinished=1` is
 * the shorthand a CLI wants, and includes lapsed holds - stale is shown, not
 * hidden. Unknown status words are refused rather than ignored, so a typo
 * cannot read as "everything".
 *
 * `?key=` names one ticket (invariant 11), so it answers as `tickets/[id]`
 * does: the ticket, or 404. It refuses a filter beside it, since "not
 * unfinished" and "nobody holds that key" would otherwise be the same 404.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { projectKey } = await ctx.params;
  const caller = requireCaller(req, projectKey, false);
  if (isResponse(caller)) return caller;
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (key !== null) {
    if (url.searchParams.has("status") || url.searchParams.has("unfinished")) {
      return NextResponse.json({ ok: false, error: "key_with_filter", hint: "A key names one ticket; send it alone." }, { status: 400 });
    }
    const problems = keyProblems(key);
    if (problems.length > 0) return NextResponse.json({ ok: false, error: "invalid_key", problems }, { status: 400 });
    const ticket = await getTicketByKey(projectKey, key);
    return ticket ? NextResponse.json({ ok: true, ticket }) : NextResponse.json({ ok: false, error: "missing" }, { status: 404 });
  }
  const unfinished = url.searchParams.get("unfinished") === "1";
  const wanted = (url.searchParams.get("status") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const bad = wanted.filter((s) => !isTicketStatus(s));
  if (bad.length > 0) return NextResponse.json({ ok: false, error: "invalid_status", details: bad }, { status: 400 });
  const tickets = await listTickets(projectKey, { unfinished, statuses: wanted as TicketStatus[] });
  return NextResponse.json({ ok: true, api_version: "v1", tickets });
}

/* Generous on the wire so a long body is refused before it is read as a
   draft; the contract's caps then say which field, in words. */
const createSchema = z.object({
  title: z.string().max(TICKET_LIMITS.title * 4),
  detail: z.string().max(TICKET_LIMITS.detail * 4).nullable().optional(),
  area: z.string().max(TICKET_LIMITS.area).nullable().optional(),
  kind: z.enum(TICKET_KINDS).default("feature"),
  askedBy: z.string().max(TICKET_LIMITS.askedBy * 4).nullable().optional(),
  key: z.string().max(TICKET_LIMITS.key * 4).nullable().optional(),
});

/** A key another ticket in this project holds is 409, with that ticket's id; the unique index decides, not a read. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { projectKey } = await ctx.params;
  const caller = requireCaller(req, projectKey, false);
  if (isResponse(caller)) return caller;
  const parsed = createSchema.safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 });
  const outcome = await createTicket(projectKey, { ...parsed.data, askedBy: parsed.data.askedBy ?? caller.actor });
  if (outcome.ok) return NextResponse.json({ ok: true, ticket: outcome.ticket }, { status: 201 });
  if (outcome.reason === "keyTaken") {
    return NextResponse.json({ ok: false, error: "key_taken", problems: outcome.problems, ticketId: outcome.ticketId }, { status: 409 });
  }
  return NextResponse.json({ ok: false, error: outcome.problems[0], problems: outcome.problems }, { status: 422 });
}
