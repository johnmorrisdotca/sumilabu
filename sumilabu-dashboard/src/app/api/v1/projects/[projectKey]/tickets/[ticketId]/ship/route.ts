import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isResponse, moveResponse, readJson, requireCaller } from "@/lib/board/http";
import { TICKET_LIMITS } from "@/lib/board/rules";
import { shipTicket } from "@/lib/board/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectKey: string; ticketId: string }> };

const shipSchema = z.object({
  version: z.string().min(1).max(TICKET_LIMITS.releasedIn),
  /* The client's own release record id, which its unship check looks for on
     origin/main. Optional for a client whose record is the version itself. */
  entryId: z.string().min(1).max(TICKET_LIMITS.releasedEntry).nullable().optional(),
  releasedAt: z.string().datetime().optional(),
});

/** Invariant 9: the release tool, and nothing else, writes `done` - from open or inProgress, under the claim condition. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { projectKey, ticketId } = await ctx.params;
  const caller = requireCaller(req, projectKey, true);
  if (isResponse(caller)) return caller;
  const parsed = shipSchema.safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 });
  const releasedAt = parsed.data.releasedAt ? new Date(parsed.data.releasedAt) : new Date();
  return moveResponse(
    await shipTicket(projectKey, ticketId, { version: parsed.data.version, entryId: parsed.data.entryId ?? null, releasedAt }, caller.actor!),
  );
}
