import { NextRequest, NextResponse } from "next/server";

import { canonicalTelemetryEventSchema, ingestTelemetryEvent } from "@/lib/app-telemetry-ingest";
import { isAuthorizedIngest } from "@/lib/ingest-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = canonicalTelemetryEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_payload", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const p = parsed.data;
  const projectKey = p.project_key || process.env.DEFAULT_PROJECT_KEY || "default";

  if (!isAuthorizedIngest(req, projectKey)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await ingestTelemetryEvent(p, body as Record<string, unknown>);

  return NextResponse.json({ ok: true, api_version: "v1", ...result });
}
