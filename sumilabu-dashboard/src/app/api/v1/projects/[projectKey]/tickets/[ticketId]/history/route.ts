import { NextRequest, NextResponse } from "next/server";

import { isResponse, notModified, requireCaller, taggedJson } from "@/lib/board/http";
import { listTicketHistory } from "@/lib/board/notes";
import { boardReadTag } from "@/lib/board/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectKey: string; ticketId: string }> };

/**
 * Invariant 15. Every title or detail change of one ticket, oldest first: who,
 * when, the old text and the new. An ETag from the board's version like the
 * ticket's own read: a PATCH that wrote history renewed the version.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { projectKey, ticketId } = await ctx.params;
  const caller = requireCaller(req, projectKey, false);
  if (isResponse(caller)) return caller;
  const etag = await boardReadTag(projectKey, `history:${ticketId}`);
  const unchanged = notModified(req, etag);
  if (unchanged) return unchanged;
  const edits = await listTicketHistory(projectKey, ticketId);
  return edits ? taggedJson(etag, { ok: true, edits }) : NextResponse.json({ ok: false, error: "missing" }, { status: 404 });
}
