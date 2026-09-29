import { timingSafeEqual } from "node:crypto";
import { unstable_cache } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { upcomingMeetings } from "@/lib/calendar/ics";

export const runtime = "nodejs";

/**
 * The next few meetings from a published calendar feed, for the MagTag.
 *
 * The board asks every 15 minutes and does its own five-minute warning from
 * the times it holds, so this only has to be right, not fast. The feed
 * (`CALENDAR_ICS_URL`, a Google "secret address in iCal format" or an
 * Outlook published calendar) is fetched through Next's data cache with a
 * 15-minute life: one fetch and one parse per quarter hour however many
 * devices ask, and Neon is never involved. `CALENDAR_TOKEN` is its own
 * secret rather than one of the board maps, because it guards one person's
 * calendar, not a project's data.
 *
 * `Cache-Control: no-store`: the caching is here, deliberately, not at an
 * edge that would hand a device a window computed for an earlier `now`.
 */
const FEED_CACHE_SECONDS = 15 * 60;
const WINDOW_SECONDS = 7 * 86400;
const MAX_LIMIT = 10;

const readFeed = unstable_cache(
  async (url: string) => {
    const res = await fetch(url, { headers: { "User-Agent": "sumilabu-calendar" }, cache: "no-store" });
    if (!res.ok) throw new Error(`feed ${res.status}`);
    return res.text();
  },
  ["calendar-feed"],
  { tags: ["calendar-feed"], revalidate: FEED_CACHE_SECONDS },
);

function authorized(req: NextRequest): boolean {
  const expected = process.env.CALENDAR_TOKEN;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers });
  const url = process.env.CALENDAR_ICS_URL;
  if (!url) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503, headers });

  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "4", 10) || 4));
  const now = Math.floor(Date.now() / 1000);
  try {
    const ics = await readFeed(url);
    const meetings = upcomingMeetings(ics, now, now + WINDOW_SECONDS, limit);
    return NextResponse.json({ ok: true, api_version: "v1", now, meetings }, { headers });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, error: "feed_unavailable" }, { status: 502, headers });
  }
}
