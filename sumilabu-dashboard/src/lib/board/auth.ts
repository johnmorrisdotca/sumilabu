import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Who may write to a project's board or its settings, and as whom.
 *
 * Deliberately not `isAuthorizedIngest`. That one returns true when no token
 * is configured, which is the right default for a telemetry sink - a device
 * that cannot phone home is worse than one that phones home unauthenticated -
 * and the wrong one for a board that takes writes: a project with no token
 * has no board, rather than an open one.
 *
 * Two token maps, one per scope, each `{ "<projectKey>": "<token>" }`:
 *
 * - `BOARD_TOKENS_JSON` moves tickets. Every agent's worktree holds one.
 * - `SETTINGS_TOKENS_JSON` reads and writes settings. Only the site's
 *   production deployment holds one, because a setting decides who may sign
 *   up, and a key that every checkout has is not the key for that.
 *
 * Both are kept apart from PROJECT_TOKENS_JSON so a leaked telemetry key does
 * not also move tickets. A project may also hold a `<key>-dev` entry in each
 * map - `umakuma-dev`, `itsutsu-dev` - which is a separate project with its
 * own rows, so a test run never writes to the real board or its settings.
 *
 * Every write names its actor in `X-Board-Actor`, which is invariant 5:
 * there is no anonymous move.
 */
export const TOKEN_SCOPES = { board: "board", settings: "settings" } as const;
export type TokenScope = (typeof TOKEN_SCOPES)[keyof typeof TOKEN_SCOPES];

const TOKEN_ENV: Record<TokenScope, string> = {
  board: "BOARD_TOKENS_JSON",
  settings: "SETTINGS_TOKENS_JSON",
};

/** The token a project presents for one scope, from that scope's map. */
export function tokenFor(scope: TokenScope, projectKey: string, env: Record<string, string | undefined> = process.env): string | null {
  const raw = env[TOKEN_ENV[scope]];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const token = parsed[projectKey];
    return typeof token === "string" && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

export function boardTokenFor(projectKey: string): string | null {
  return tokenFor(TOKEN_SCOPES.board, projectKey);
}

function tokenMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type BoardCaller = { projectKey: string; actor: string | null };

/** The caller, or null when the request may not touch this project in this scope. */
export function authorizeBoard(req: NextRequest, projectKey: string, scope: TokenScope = TOKEN_SCOPES.board): BoardCaller | null {
  const expected = tokenFor(scope, projectKey);
  if (!expected) return null;
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  if (!tokenMatches(auth.slice("Bearer ".length).trim(), expected)) return null;
  const actor = req.headers.get("x-board-actor")?.trim() ?? "";
  return { projectKey, actor: actor.length > 0 && actor.length <= 80 ? actor : null };
}
