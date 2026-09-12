import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isResponse, moveResponse, readJson, requireCaller } from "@/lib/board/http";
import { unshipTicket } from "@/lib/board/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectKey: string; ticketId: string }> };

/* The client says why, because only the client can check its own main. */
const unshipSchema = z.object({ reason: z.string().min(8).max(400) });

/**
 * The one way out of `done`: a release stamp that never reached the client's
 * main. The service cannot ask origin/main; the client does, and sends the
 * reason. A shipped release is never reopened - that is a new `fix` row.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { projectKey, ticketId } = await ctx.params;
  const caller = requireCaller(req, projectKey, true);
  if (isResponse(caller)) return caller;
  const parsed = unshipSchema.safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 });
  return moveResponse(await unshipTicket(projectKey, ticketId));
}
