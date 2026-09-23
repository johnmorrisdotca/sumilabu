import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isResponse, readJson, requireCaller, stampResponse } from "@/lib/board/http";
import { releaseEntrySchema, releaseVersionSchema, releasedAtSchema } from "@/lib/board/rules";
import { stampTicket } from "@/lib/board/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectKey: string; ticketId: string }> };

const stampSchema = z.object({
  version: releaseVersionSchema,
  entryId: releaseEntrySchema,
  /* Unlike `ship`'s, this is not optional: a stamp is a record of when a
     release already went out, and defaulting it to now would write today's
     date onto a row that shipped months ago. */
  releasedAt: releasedAtSchema,
});

/**
 * The backfill for a `done` row closed before release stamps existed: same
 * auth and `X-Board-Actor` handling as `ship`, but it never moves the row -
 * see `stampTicket` in `server.ts`. Refuses 409 `notDone` off a row that
 * is not `done`, and 409 `alreadyStamped` rather than overwrite a version
 * that is already recorded.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { projectKey, ticketId } = await ctx.params;
  const caller = requireCaller(req, projectKey, true);
  if (isResponse(caller)) return caller;
  const parsed = stampSchema.safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 });
  return stampResponse(
    await stampTicket(projectKey, ticketId, {
      version: parsed.data.version,
      entryId: parsed.data.entryId ?? null,
      releasedAt: new Date(parsed.data.releasedAt),
    }),
  );
}
