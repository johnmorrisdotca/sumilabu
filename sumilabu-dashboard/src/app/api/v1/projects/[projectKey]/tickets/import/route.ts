import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isResponse, readJson, requireCaller } from "@/lib/board/http";
import { TICKET_EFFORTS, TICKET_KINDS, TICKET_LIMITS, TICKET_PRIORITIES, TICKET_STATUSES } from "@/lib/board/rules";
import { importTickets } from "@/lib/board/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectKey: string }> };

const iso = z.string().datetime();

const rowSchema = z.object({
  id: z.string().min(1).max(64),
  key: z.string().max(TICKET_LIMITS.key * 4).nullable().optional(),
  title: z.string().max(TICKET_LIMITS.title * 4),
  detail: z.string().max(TICKET_LIMITS.detail * 4).nullable().optional(),
  area: z.string().max(80).nullable().optional(),
  kind: z.enum(TICKET_KINDS),
  status: z.enum(TICKET_STATUSES),
  priority: z.enum(TICKET_PRIORITIES).nullable().optional(),
  effort: z.enum(TICKET_EFFORTS).nullable().optional(),
  askedBy: z.string().max(TICKET_LIMITS.askedBy * 4).nullable().optional(),
  claimedBy: z.string().max(TICKET_LIMITS.claimedBy * 4).nullable().optional(),
  claimedAt: iso.nullable().optional(),
  releasedIn: z.string().max(TICKET_LIMITS.releasedIn).nullable().optional(),
  releasedEntry: z.string().max(TICKET_LIMITS.releasedEntry).nullable().optional(),
  releasedAt: iso.nullable().optional(),
  createdAt: iso,
  movedAt: iso,
});

const importSchema = z.object({ tickets: z.array(rowSchema).min(1).max(1000) });

/**
 * A client's existing board, brought over with ids and dates intact.
 *
 * Canonical words on the wire: the client maps its stored `filed` to open,
 * `shipped` to done, `bug` to fix, and so on, before sending. Upserts by id,
 * so a run that failed half way is re-run rather than reconciled.
 *
 * Keys come across as they stand (invariant 11). A row whose key belongs to
 * a different ticket in this project, or that would change a key already
 * stored, refuses the whole import with a problem naming the row, before
 * anything is written.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { projectKey } = await ctx.params;
  const caller = requireCaller(req, projectKey, true);
  if (isResponse(caller)) return caller;
  const parsed = importSchema.safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 });
  const rows = parsed.data.tickets.map((row) => ({
    ...row,
    claimedAt: row.claimedAt ? new Date(row.claimedAt) : null,
    releasedAt: row.releasedAt ? new Date(row.releasedAt) : null,
    createdAt: new Date(row.createdAt),
    movedAt: new Date(row.movedAt),
  }));
  const outcome = await importTickets(projectKey, rows);
  if (!outcome.ok) return NextResponse.json({ ok: false, error: outcome.problems[0], problems: outcome.problems }, { status: 422 });
  return NextResponse.json({ ok: true, imported: outcome.imported });
}
