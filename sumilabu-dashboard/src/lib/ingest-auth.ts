import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";

export function parseProjectTokens(): Record<string, string> {
  const raw = process.env.PROJECT_TOKENS_JSON;
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed || {};
  } catch {
    return {};
  }
}

/** Constant time and length-blind: both sides are hashed to the same length first (found by the SUMILABU-7 audit; it was `===`). */
function sameToken(presented: string, expected: string): boolean {
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Telemetry's door. Still open when no token is configured at all, on
 * purpose (see `lib/board/auth.ts`: a device that cannot phone home is worse
 * than one that phones home unauthenticated, and installed firmware cannot be
 * updated). These routes only write; none returns stored data.
 */
export function isAuthorizedIngest(req: NextRequest, projectKey: string): boolean {
  const projectTokens = parseProjectTokens();
  const projectToken = projectTokens[projectKey];
  const fallbackToken = process.env.INGEST_API_TOKEN;
  const configuredToken = projectToken || fallbackToken;

  if (!configuredToken) {
    return true;
  }

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) {
    return false;
  }

  const token = auth.slice("Bearer ".length).trim();
  return sameToken(token, configuredToken);
}
