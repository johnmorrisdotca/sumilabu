import { NextResponse, type NextRequest } from "next/server";

import { sameOriginWrite } from "@/lib/auth/same-origin";
import { adminFromCookies } from "@/lib/auth/session";
import { forgetDashboardData } from "@/lib/dashboard-data";
import { forgetScorecard } from "@/lib/scorecard/data";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * The page's Refresh button (John, 2026-11-03: "a force refresh button to
 * clear the cache and show new data"): `POST` with no body clears the
 * scorecard's and the dashboard's cached reads, and the page then asks the
 * server again, so the next render reads the database once. Under /packages
 * like the hearts, so the page gate in proxy.ts stands in front of it, and the
 * same second lock: John's session and a request from this site's own page.
 * It never reads the database itself; a press costs one read on the render
 * that follows, and only when someone presses it.
 */
export async function POST(req: NextRequest) {
  if (!(await adminFromCookies(req.cookies))) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: NO_STORE });
  if (!sameOriginWrite(req.headers)) return NextResponse.json({ ok: false, error: "cross_origin" }, { status: 403, headers: NO_STORE });
  forgetScorecard();
  forgetDashboardData();
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
