import { createHash, randomUUID } from "node:crypto";

import { revalidateTag, unstable_cache } from "next/cache";

import { leaseExpired } from "./rules";

/*
 * A version per board, kept in Next's data cache, so an unchanged board is
 * answered 304 with no database query (SUMILABU-15).
 *
 * On 2026-11-03 Neon had been awake 35 of the month's first 59 hours (8.9
 * CU-hours, on course for about 108 against the Free plan's 100) and had sent
 * 544 MB (on course for 6.6 GB against 5). Agents' `pnpm task` calls were
 * nearly all of the 3,758 requests of the day before, and each read sent the
 * whole board out of Postgres (spx-stats' is 1.25 MB with its done tickets)
 * even when nothing had changed.
 *
 * Why a version and not the answers themselves: the data cache bills by
 * 8 KB written, at about ten times a read, the team's projects share its
 * allowance, and boards are written about as often as they are read (1,297
 * writes and 1,721 reads that day). Caching each list would write its whole
 * body again after nearly every write, tens of units each time; the version
 * is one unit. A client that sends back its ETag gets a 304 from the version
 * alone; a client without one, or after a change, reads Postgres as before.
 *
 * The version is a random stamp made when the entry is filled, plus the
 * claim times of the board's held tickets. Every write in `server.ts` (and
 * filing a report as a ticket) clears the board's tag, so the next read
 * makes a new stamp and every old ETag stops matching. The claim times are
 * there because `heldNow` follows the clock: the ETag counts the leases that
 * have run out by now, so a lapsed hold changes it with no write and no
 * query. Nothing about the caller, and never a token, is in the key, the
 * value or the ETag. An eviction or the day-long revalidate only makes a new
 * stamp, which costs one 200; the day also bounds how long a row changed
 * outside these routes (Prisma Studio, SQL) can be answered 304.
 */
export const BOARD_CACHE_SECONDS = 24 * 60 * 60;

export const boardTag = (projectKey: string) => `board-tickets:${projectKey}`;

export type BoardVersion = { stamp: string; claimedAt: string[] };

export function cachedBoardVersion(projectKey: string, readClaims: () => Promise<string[]>): Promise<BoardVersion> {
  return unstable_cache(
    async (): Promise<BoardVersion> => ({ stamp: randomUUID(), claimedAt: (await readClaims()).sort() }),
    ["board-version", projectKey],
    { tags: [boardTag(projectKey)], revalidate: BOARD_CACHE_SECONDS },
  )();
}

/** A strong validator: the version, the read's shape, and how many holds have lapsed by `nowMs`. */
export function boardEtag(version: BoardVersion, shape: string, nowMs = Date.now()): string {
  const lapsed = version.claimedAt.filter((at) => leaseExpired(at, nowMs)).length;
  const digest = createHash("sha256").update(`${version.stamp}\n${shape}\n${lapsed}`).digest("base64url");
  return `"${digest.slice(0, 27)}"`;
}

/** `expire: 0`, not "max": the next read after a write must see it, not one stale answer first. */
export function forgetBoard(projectKey: string): void {
  revalidateTag(boardTag(projectKey), { expire: 0 });
}
