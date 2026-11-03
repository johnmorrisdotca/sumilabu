import { NextResponse, type NextRequest } from "next/server";

import { sameOriginWrite } from "@/lib/auth/same-origin";
import { adminFromCookies } from "@/lib/auth/session";
import { getScorecard } from "@/lib/scorecard/data";
import { applyToggle, readToggle } from "@/lib/scorecard/favourites";
import { loadFavouritesFresh, saveFavourites } from "@/lib/scorecard/favourites-store";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };
/** `{"id":"…100 chars…","on":true}` is about 120 bytes; anything much bigger is not a heart. */
const MAX_BODY_BYTES = 512;

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
}

/**
 * One heart on the scorecard (SUMILABU-9): `POST { id, on }`, answered with
 * the whole list as stored. Under /packages, not /api, so the page gate in
 * proxy.ts stands in front of it as it does every page; the checks below are
 * the second lock and the ones a write needs besides: John's session, a
 * request from this site's own page, and an id from the current run. The
 * order is cheap to costly, and only a request that passed all of them reads
 * or writes the database. There is no GET: the page reads the list in the
 * same render as the scorecard.
 */
export async function POST(req: NextRequest) {
  const admin = await adminFromCookies(req.cookies);
  if (!admin) return fail("unauthorized", 401);
  if (!sameOriginWrite(req.headers)) return fail("cross_origin", 403);
  if (!(req.headers.get("content-type") ?? "").startsWith("application/json")) return fail("invalid_payload", 415);
  if (Number(req.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) return fail("invalid_payload", 413);

  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return fail("invalid_payload", 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return fail("invalid_payload", 400);
  }
  const request = readToggle(body);
  if (!request) return fail("invalid_payload", 400);

  const data = await getScorecard();
  if (!data) return fail("unknown_item", 404);
  const outcome = applyToggle(await loadFavouritesFresh(), request, new Set(data.doc.items.map((i) => i.id)));
  if (!outcome.ok) return fail(outcome.error, outcome.error === "unknown_item" ? 404 : 422);
  await saveFavourites(outcome.favourites, admin.email);
  return NextResponse.json({ ok: true, favourites: outcome.favourites }, { headers: NO_STORE });
}
