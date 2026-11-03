import type { ScorecardItem } from "./contract";

/*
 * Which picture to draw where (SUMILABU-8). The family publishes three per
 * package on GitHub Pages: a 1200x630 card, its dark twin, and a 512 px square
 * made to read at 40 px. Until those exist the collector's fallback (the
 * README's first image, or a site's og:image) is the card, cropped by the page.
 * The links were checked by the contract on the way in; nothing here fetches.
 */

export type Picture = { light: string; dark: string | null; square: boolean };

/** For a small slot (a table row, the map): the square icon, else the card cropped. */
export function smallPicture(item: Pick<ScorecardItem, "links">): Picture | null {
  if (item.links.icon) return { light: item.links.icon, dark: null, square: true };
  if (item.links.thumbnail) return { light: item.links.thumbnail, dark: item.links.thumbnailDark ?? null, square: false };
  return null;
}

/** For a large slot (a phone card, the detail header): the card, with its dark twin when there is one. */
export function cardPicture(item: Pick<ScorecardItem, "links">): Picture | null {
  if (item.links.thumbnail) return { light: item.links.thumbnail, dark: item.links.thumbnailDark ?? null, square: false };
  if (item.links.icon) return { light: item.links.icon, dark: null, square: true };
  return null;
}

/** Picture links are not places to go: the detail's row of links leaves them out. */
export const PICTURE_LINK_KEYS: ReadonlySet<string> = new Set(["thumbnail", "thumbnailDark", "icon"]);
