import { revalidateTag, unstable_cache } from "next/cache";

import { readScorecard, type ScorecardData } from "./server";

/*
 * What /packages reads, answered from Next's data cache.
 *
 * Nothing about the scorecard changes except when the collector uploads a run,
 * and the upload clears the tag (`forgetScorecard`), so a page view costs a
 * database read only the first time after a run arrives. The week-long
 * revalidate just bounds a row edited by hand in SQL. This is the same
 * arrangement as lib/dashboard-data.ts and for the same reason: on this
 * account a reader that can wake Neon on a bot's schedule is a bug (see
 * AGENTS.md, "Server CPU is metered and shared"). Nothing here is on a timer.
 */

export const SCORECARD_TAG = "scorecard";
const SCORECARD_CACHE_SECONDS = 7 * 24 * 60 * 60;

export async function getScorecard(): Promise<ScorecardData | null> {
  return unstable_cache(readScorecard, ["scorecard-latest"], { tags: [SCORECARD_TAG], revalidate: SCORECARD_CACHE_SECONDS })();
}

/** Called after an upload. `expire: 0` so the next page view shows the new run, not one stale answer first. */
export function forgetScorecard(): void {
  revalidateTag(SCORECARD_TAG, { expire: 0 });
}
