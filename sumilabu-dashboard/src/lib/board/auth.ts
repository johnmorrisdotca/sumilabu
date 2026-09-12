import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Who may write to a project's board, and as whom.
 *
 * Deliberately not `isAuthorizedIngest`. That one returns true when no token
 * is configured, which is the right default for a telemetry sink - a device
 * that cannot phone home is worse than one that phones home unauthenticated -
 * and the wrong one for a board that takes writes: a project with no token
 * has no board, rather than an open one.
 *
 * Tokens come from BOARD_TOKENS_JSON, `{ "umakuma": "…", "itsutsu": "…" }`,
 * kept apart from PROJECT_TOKENS_JSON so a leaked telemetry key does not
 * also move tickets. Every write names its actor in `X-Board-Actor`, which
 * is invariant 5: there is no anonymous move.
 */
export function boardTokenFor(projectKey: string): string | null {
  const raw = process.env.BOARD_TOKENS_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const token = parsed[projectKey];
    return typeof token === "string" && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

function tokenMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type BoardCaller = { projectKey: string; actor: string | null };

/** The caller, or null when the request may not touch this project's board. */
export function authorizeBoard(req: NextRequest, projectKey: string): BoardCaller | null {
  const expected = boardTokenFor(projectKey);
  if (!expected) return null;
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  if (!tokenMatches(auth.slice("Bearer ".length).trim(), expected)) return null;
  const actor = req.headers.get("x-board-actor")?.trim() ?? "";
  return { projectKey, actor: actor.length > 0 && actor.length <= 80 ? actor : null };
}
