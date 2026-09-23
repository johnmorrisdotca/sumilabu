import { NextResponse } from "next/server";

import type { CreateOutcome, FileOutcome, PatchOutcome } from "./server";

/** One shape for every refused create, so every client reads the same reason. */
export function createResponse(outcome: CreateOutcome): NextResponse {
  if (outcome.ok) return NextResponse.json({ ok: true, report: outcome.report }, { status: 201 });
  if (outcome.reason === "rate_limited") {
    return NextResponse.json(
      { ok: false, error: "rate_limited", scope: outcome.scope, retryAfterMs: outcome.retryAfterMs },
      { status: 429, headers: { "Retry-After": String(Math.ceil(outcome.retryAfterMs / 1000)) } },
    );
  }
  return NextResponse.json({ ok: false, error: outcome.problems[0], problems: outcome.problems }, { status: 422 });
}

export function patchResponse(outcome: PatchOutcome): NextResponse {
  if (outcome.ok) return NextResponse.json({ ok: true, report: outcome.report });
  if (outcome.reason === "invalid") return NextResponse.json({ ok: false, error: outcome.problems[0], problems: outcome.problems }, { status: 422 });
  if (outcome.reason === "missing") return NextResponse.json({ ok: false, error: "missing" }, { status: 404 });
  return NextResponse.json({ ok: false, error: "illegal", report: outcome.report }, { status: 409 });
}

export function fileResponse(outcome: FileOutcome): NextResponse {
  if (outcome.ok) return NextResponse.json({ ok: true, report: outcome.report, ticketId: outcome.ticketId });
  if (outcome.reason === "missing") return NextResponse.json({ ok: false, error: "missing" }, { status: 404 });
  if (outcome.reason === "invalid") return NextResponse.json({ ok: false, error: outcome.problems[0], problems: outcome.problems }, { status: 422 });
  return NextResponse.json({ ok: false, error: "not_fileable", report: outcome.report }, { status: 409 });
}
