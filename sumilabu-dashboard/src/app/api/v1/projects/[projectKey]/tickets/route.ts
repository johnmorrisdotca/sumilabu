import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isResponse, readJson, requireCaller } from "@/lib/board/http";
import { TICKET_KINDS, TICKET_LIMITS, isTicketStatus, type TicketStatus } from "@/lib/board/rules";
import { createTicket, listTickets } from "@/lib/board/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectKey: string }> };

/**
 * This project's tickets, with `heldNow` already decided.
 *
 * `?status=open,inProgress` narrows by canonical status; `?unfinished=1` is
 * the shorthand a CLI wants, and includes lapsed holds - stale is shown, not
 * hidden. Unknown status words are refused rather than ignored, so a typo
 * cannot read as "everything".
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { projectKey } = await ctx.params;
  const caller = requireCaller(req, projectKey, false);
  if (isResponse(caller)) return caller;
  const url = new URL(req.url);
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
  area: z.string().max(80).nullable().optional(),
  kind: z.enum(TICKET_KINDS).default("feature"),
  askedBy: z.string().max(TICKET_LIMITS.askedBy * 4).nullable().optional(),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  const { projectKey } = await ctx.params;
  const caller = requireCaller(req, projectKey, false);
  if (isResponse(caller)) return caller;
  const parsed = createSchema.safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 });
  const outcome = await createTicket(projectKey, { ...parsed.data, askedBy: parsed.data.askedBy ?? caller.actor });
  if (!outcome.ok) return NextResponse.json({ ok: false, error: outcome.problems[0], problems: outcome.problems }, { status: 422 });
  return NextResponse.json({ ok: true, ticket: outcome.ticket }, { status: 201 });
}
