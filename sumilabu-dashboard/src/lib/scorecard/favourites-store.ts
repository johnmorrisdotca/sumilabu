import { getSetting, setSetting } from "@/lib/board/server";
import { prisma } from "@/lib/prisma";

import { readFavourites } from "./favourites";

/*
 * Where the hearts live: one row of the board's settings store, so there is no
 * new table and no schema change. The project key starts with an underscore
 * and no settings token is ever issued for it, so the token API cannot read or
 * write it; only the page and its own same-origin POST, both behind John's
 * Google session, reach it. One list for the site, because both admin
 * addresses are John's and the point is that the hearts follow him.
 *
 * Reads come from the settings cache (`getSetting`, cleared by `setSetting`),
 * so a page view does not wake Neon for this either.
 */
export const FAVOURITES_PROJECT = "_sumilabu-site";
export const FAVOURITES_KEY = "scorecard.favourites";

export async function loadFavourites(): Promise<string[]> {
  const row = await getSetting(FAVOURITES_PROJECT, FAVOURITES_KEY);
  return readFavourites(row?.value);
}

/**
 * The list as stored right now, past the cache: what a press changes. Read
 * through the cache inside the same request that then clears it, the cache
 * keeps the old list (its write lands after the clear), and two quick presses
 * lost the first one in the end-to-end run of 2026-11-03. A press wakes the
 * database anyway.
 */
export async function loadFavouritesFresh(): Promise<string[]> {
  const row = await prisma.boardSetting.findUnique({ where: { projectKey_key: { projectKey: FAVOURITES_PROJECT, key: FAVOURITES_KEY } }, select: { value: true } });
  return readFavourites(row?.value);
}

export async function saveFavourites(ids: readonly string[], email: string): Promise<void> {
  await setSetting(FAVOURITES_PROJECT, FAVOURITES_KEY, JSON.stringify(ids), email.slice(0, 80));
}
