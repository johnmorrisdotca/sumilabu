import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Can this deployment reach its database?
 *
 * THE CHECK THE DEPLOY DID NOT HAVE, and the reason it now does. On
 * 2026-09-22 the dashboard moved from `vercel deploy --prod` on somebody's
 * laptop — where Vercel built the project itself — to a GitHub runner that
 * builds and uploads with `--prebuilt`. Prisma generates a query engine for
 * the machine it runs on, so the client went out carrying Ubuntu's engine to a
 * function running on Amazon Linux, and every route that touches the database
 * answered 500 with an empty body for four sites at once.
 *
 * Every step of that deploy was green. The smoke check read
 * `/api/openapi.json`, which is a constant, so it proved the function booted
 * and nothing else — a check that could not fail for the reason the site was
 * broken. This one asks the database the smallest question there is, which is
 * the question that was actually wrong.
 *
 * It says whether, never what. No counts, no names, no version, nothing about
 * the schema: an unauthenticated caller learns only that this deployment can
 * open a connection, which is the same thing they learn by watching the site
 * work. 503 rather than 500 when it cannot, because "I am here and my database
 * is not" is a different fact from a crash, and the deploy should be able to
 * tell them apart.
 *
 * One trivial query, asked once per deploy by the workflow's smoke step. It is
 * not for polling, and nothing should put it on a timer.
 *
 * Not the route a reporting client asks before showing its form - that
 * traffic shape (once per dialog a member opens, across every site) wants
 * `GET /api/v1/health` instead, which is the same question behind a reports
 * token so this one can stay open and unauthenticated for the deploy step.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, database: "reachable" });
  } catch {
    // Deliberately not the error: it would carry the connection string's host.
    return NextResponse.json({ ok: false, database: "unreachable" }, { status: 503 });
  }
}
