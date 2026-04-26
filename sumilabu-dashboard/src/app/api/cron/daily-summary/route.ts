import { NextRequest, NextResponse } from "next/server";

import { isEmailConfigured, parseEmailList, sendEmail } from "@/lib/email";
import { buildTelemetrySummary, renderTelemetrySummaryEmail } from "@/lib/telemetry-summary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const recipients = parseEmailList(process.env.TELEMETRY_SUMMARY_RECIPIENTS);
  if (recipients.length === 0) {
    return NextResponse.json(
      { ok: false, error: "missing_recipients", configured: isEmailConfigured() },
      { status: 500 },
    );
  }

  const summary = await buildTelemetrySummary();
  const email = renderTelemetrySummaryEmail(summary);
  const result = await sendEmail({ ...email, to: recipients });

  if (!result.success) {
    return NextResponse.json({ ok: false, ...result }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    emailId: result.emailId,
    provider: result.provider,
    recipients: recipients.length,
    totals: summary.totals,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
