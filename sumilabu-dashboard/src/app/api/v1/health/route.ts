import { NextRequest, NextResponse } from "next/server";

import { TOKEN_SCOPES, authorizeAnyBoard } from "@/lib/board/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Is the database reachable - the one thing a reporting client needs to know
 * before it lets a member type into a form it cannot yet submit to.
 *
 * Not `/api/health`, on purpose. That route is unauthenticated, by design -
 * it exists for the deploy workflow's own smoke check, asked once per
 * deploy, and its own doc comment says nothing should put it on a timer. A
 * reporting client asks this question once per report dialog a member opens
 * across every site, which is a traffic shape that route was explicitly not
 * built to take. This one is that same query, gated so it can take that
 * traffic without being an open door to database load.
 *
 * Requires a reports token (any project's, `authorizeAnyBoard`): an
 * unauthenticated route that runs a database query on every hit can be
 * hammered by anyone, and on this account that CPU is shared with every
 * other project. A site's server already holds its reports token for the
 * create/list/patch calls this same client makes, so this costs it nothing
 * new - and the browser never calls this route directly, so the token never
 * needs to leave a server.
 *
 * `Cache-Control: no-store`: the *answer* is meant to be cached, but by the
 * caller (about 30 s, per the reports contract), never by anything between
 * here and there - a stale "down" cached at an edge would keep reporting
 * paused after the database came back.
 */
export async function GET(req: NextRequest) {
  const caller = authorizeAnyBoard(req, TOKEN_SCOPES.reports);
  if (!caller) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
