import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { parseScorecard } from "@/lib/scorecard/contract";
import { forgetScorecard } from "@/lib/scorecard/data";
import { saveScorecardRun } from "@/lib/scorecard/server";

export const runtime = "nodejs";

/** A run is a few hundred KB at most; 1 MiB is generous and keeps one cached page under Next's 2 MB data-cache entry. */
export const MAX_BODY_BYTES = 1024 * 1024;
/** A document dated more than a day ahead would sit as "the latest run" until the clock caught up with it. */
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

const NO_STORE = { "Cache-Control": "no-store" };

function tokenMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** A deployment with no SCORECARD_TOKEN accepts nothing: like the board, no token means no door. */
function authorized(req: NextRequest): boolean {
  const expected = process.env.SCORECARD_TOKEN;
  if (!expected) return false;
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  return tokenMatches(auth.slice("Bearer ".length).trim(), expected);
}

function fail(error: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status, headers: NO_STORE });
}

/**
 * Upload one scorecard run (docs/scorecard.md). Bearer `SCORECARD_TOKEN`; the
 * body is the collector's JSON document, at most 1 MiB, checked against the
 * contract before anything is stored. One row per run, the newest ten kept,
 * and the page's cache is cleared so the next view shows it. The order is
 * cheap to costly: token, then declared size, then the body, then the shape,
 * and the database is only reached by a document that passed all of them.
 */
export async function POST(req: NextRequest) {
  if (!authorized(req)) return fail("unauthorized", 401);

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return fail("too_large", 413, { limitBytes: MAX_BODY_BYTES });

  const text = await req.text();
  const byteSize = Buffer.byteLength(text);
  if (byteSize > MAX_BODY_BYTES) return fail("too_large", 413, { limitBytes: MAX_BODY_BYTES });

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return fail("invalid_json", 400);
  }

  const parsed = parseScorecard(body);
  if (!parsed.ok) return fail("invalid_payload", 422, { problems: parsed.problems });

  if (new Date(parsed.doc.generatedAt).getTime() > Date.now() + MAX_FUTURE_MS) {
    return fail("invalid_payload", 422, { problems: ["generatedAt: is more than a day in the future"] });
  }

  try {
    const { pruned } = await saveScorecardRun(parsed.doc, byteSize);
    forgetScorecard();
    return NextResponse.json(
      { ok: true, generatedAt: parsed.doc.generatedAt, items: parsed.doc.items.length, bytes: byteSize, pruned },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error(error);
    return fail("unavailable", 503);
  }
}
