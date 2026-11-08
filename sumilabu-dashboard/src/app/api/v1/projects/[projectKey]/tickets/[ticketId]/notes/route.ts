import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isResponse, notModified, readJson, requireCaller, taggedJson } from "@/lib/board/http";
import { addTicketNote, listTicketNotes } from "@/lib/board/notes";
import { TICKET_LIMITS } from "@/lib/board/rules";
import { boardReadTag } from "@/lib/board/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectKey: string; ticketId: string }> };

/** Invariant 16. A ticket's notes, oldest first. An ETag from the board's version; adding a note renews it. */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { projectKey, ticketId } = await ctx.params;
  const caller = requireCaller(req, projectKey, false);
  if (isResponse(caller)) return caller;
  const etag = await boardReadTag(projectKey, `notes:${ticketId}`);
  const unchanged = notModified(req, etag);
  if (unchanged) return unchanged;
  const notes = await listTicketNotes(projectKey, ticketId);
  return notes ? taggedJson(etag, { ok: true, notes }) : NextResponse.json({ ok: false, error: "missing" }, { status: 404 });
}

/* Generous on the wire, then the cap says so in words, as a detail's does. */
const noteSchema = z.object({ body: z.string().max(TICKET_LIMITS.note * 4) });

/**
 * Appends a note, on a ticket in any status. A write, so it names its actor
 * (invariant 5). There is no route to edit or delete one.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { projectKey, ticketId } = await ctx.params;
  const caller = requireCaller(req, projectKey, true);
  if (isResponse(caller)) return caller;
  const parsed = noteSchema.safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 });

  const outcome = await addTicketNote(projectKey, ticketId, parsed.data.body, caller.actor ?? "");
  if (outcome.ok) return NextResponse.json({ ok: true, note: outcome.note }, { status: 201 });
  if (outcome.reason === "invalid") return NextResponse.json({ ok: false, error: outcome.problems[0], problems: outcome.problems }, { status: 422 });
  return NextResponse.json({ ok: false, error: "missing" }, { status: 404 });
}
