import { NextRequest, NextResponse } from "next/server";

import { TOKEN_SCOPES, authorizeBoard, type BoardCaller, type TokenScope } from "./auth";
import type { MoveOutcome } from "./server";

/**
 * 401 for a bad or missing token; 400 for a write with nobody named. The
 * scope says which token map is asked: the ticket routes take the board
 * token, the settings routes the settings token, and neither accepts the other.
 */
export function requireCaller(
  req: NextRequest,
  projectKey: string,
  needsActor: boolean,
  scope: TokenScope = TOKEN_SCOPES.board,
): BoardCaller | NextResponse {
  const caller = authorizeBoard(req, projectKey, scope);
  if (!caller) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (needsActor && !caller.actor) {
    return NextResponse.json({ ok: false, error: "actor_required", hint: "Send X-Board-Actor: <who>" }, { status: 400 });
  }
  return caller;
}

export function isResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

export async function readJson(req: NextRequest): Promise<unknown | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/** One shape for every refused move, so both clients read the same reason. */
export function moveResponse(outcome: MoveOutcome): NextResponse {
  if (outcome.ok) return NextResponse.json({ ok: true, ticket: outcome.ticket });
  if (outcome.reason === "missing") return NextResponse.json({ ok: false, error: "missing" }, { status: 404 });
  return NextResponse.json(
    { ok: false, error: outcome.reason, heldBy: outcome.heldBy ?? null, ticket: outcome.ticket },
    { status: 409 },
  );
}
