import { NextRequest, NextResponse } from "next/server";

import { isResponse, requireCaller } from "@/lib/board/http";
import { removeTicketLink } from "@/lib/board/links";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectKey: string; ticketId: string; otherId: string }> };

/**
 * Invariant 18. Removes the link between this ticket and `otherId` (short id
 * or cuid), in any status. A link that is not there is already gone, as a
 * setting is: 200 with `removed: false`. 404 only for the ticket in the path.
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { projectKey, ticketId, otherId } = await ctx.params;
  const caller = requireCaller(req, projectKey, true);
  if (isResponse(caller)) return caller;
  const outcome = await removeTicketLink(projectKey, ticketId, otherId);
  return outcome.ok
    ? NextResponse.json({ ok: true, removed: outcome.removed, related: outcome.related })
    : NextResponse.json({ ok: false, error: "missing" }, { status: 404 });
}
