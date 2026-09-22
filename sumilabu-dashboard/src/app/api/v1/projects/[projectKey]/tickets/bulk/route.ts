import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isResponse, readJson, requireCaller } from "@/lib/board/http";
import { TICKET_EFFORTS, TICKET_KINDS, TICKET_LIMITS, TICKET_MOVE_TARGETS, TICKET_PRIORITIES } from "@/lib/board/rules";
import { patchTicket, type PatchOutcome } from "@/lib/board/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectKey: string }> };

/* One request body, not one Postgres transaction: each row is the same
   conditional write PATCH tickets/[id] makes (invariant 4), so a hold
   somebody else took between two rows of the same batch refuses only that
   row. A cap keeps one request from holding the connection over many
   sequential round trips. */
const MAX_BULK = 100;

const updateSchema = z.object({
  id: z.string().min(1).max(64),
  status: z.enum(TICKET_MOVE_TARGETS).optional(),
  priority: z.enum(TICKET_PRIORITIES).nullable().optional(),
  effort: z.enum(TICKET_EFFORTS).nullable().optional(),
  title: z.string().max(TICKET_LIMITS.title * 4).optional(),
  detail: z.string().max(TICKET_LIMITS.detail * 4).nullable().optional(),
  area: z.string().max(TICKET_LIMITS.area * 4).nullable().optional(),
  askedBy: z.string().max(TICKET_LIMITS.askedBy * 4).nullable().optional(),
  kind: z.enum(TICKET_KINDS).optional(),
});

const bulkSchema = z.object({ updates: z.array(updateSchema).min(1).max(MAX_BULK) });

const NEEDS_ACTOR_FIELDS = ["status", "title", "detail", "area", "askedBy", "kind"] as const;

function outcomeJson(id: string, outcome: PatchOutcome) {
  if (outcome.ok) return { id, ok: true as const, ticket: outcome.ticket };
  if (outcome.reason === "invalid") return { id, ok: false as const, error: outcome.problems[0], problems: outcome.problems };
  if (outcome.reason === "missing") return { id, ok: false as const, error: "missing" };
  return { id, ok: false as const, error: outcome.reason, heldBy: outcome.heldBy ?? null };
}

/**
 * Many tickets patched by id in one request, each exactly as `PATCH
 * tickets/[id]` would treat it. There is no partial rollback: a batch
 * reports which rows actually changed rather than pretending one row's
 * stale hold should undo another row's successful move. A key is refused by
 * name on any row, the same as a single PATCH (invariant 11).
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { projectKey } = await ctx.params;
  const body = await readJson(req);
  const rawUpdates = body !== null && typeof body === "object" && Array.isArray((body as { updates?: unknown }).updates)
    ? ((body as { updates: unknown[] }).updates)
    : [];
  if (rawUpdates.some((row) => row !== null && typeof row === "object" && "key" in row)) {
    return NextResponse.json({ ok: false, error: "key_immutable", hint: "A key is written once, at create or import." }, { status: 400 });
  }
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 });

  const needsActor = parsed.data.updates.some((row) => NEEDS_ACTOR_FIELDS.some((field) => row[field] !== undefined));
  const caller = requireCaller(req, projectKey, needsActor);
  if (isResponse(caller)) return caller;

  const results = [];
  for (const { id, ...patch } of parsed.data.updates) {
    const outcome = await patchTicket(projectKey, id, patch, caller.actor ?? "");
    results.push(outcomeJson(id, outcome));
  }
  return NextResponse.json({ ok: true, results });
}
