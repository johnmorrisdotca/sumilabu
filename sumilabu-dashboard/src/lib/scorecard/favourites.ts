import type { ScorecardItem } from "./contract";

/*
 * Favourite packages (SUMILABU-9): which items John has hearted, as a list of
 * item ids. Pure, so the order, the filter and the rules for a write each have
 * a test; `favourites-store.ts` keeps the list and the route checks who asks.
 */

/** An item id, exactly as the contract allows one. */
export const ITEM_ID = /^[A-Za-z0-9._@/-]{1,100}$/;

/** The stored list must fit the settings row (VARCHAR 4000) as JSON. 200 items of the run's length fit easily. */
export const MAX_FAVOURITES_JSON = 4000;

/** The stored text as a list of ids; anything that is not one is dropped, never thrown. */
export function readFavourites(stored: string | null | undefined): string[] {
  if (!stored) return [];
  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === "string" && ITEM_ID.test(v)))];
}

export type ToggleRequest = { id: string; on: boolean };

/** The body of a toggle, or null: `{ id, on }` and nothing looser. */
export function readToggle(body: unknown): ToggleRequest | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { id, on } = body as Record<string, unknown>;
  if (typeof id !== "string" || !ITEM_ID.test(id) || typeof on !== "boolean") return null;
  return { id, on };
}

export type ToggleOutcome = { ok: true; favourites: string[] } | { ok: false; error: "unknown_item" | "too_many" };

/**
 * One heart pressed. Adding needs an id of the current run; removing any id
 * is allowed, so a heart on an item that left the run can still be cleared.
 * Ids no longer in the run are dropped on every write, so the list cannot
 * grow past what the run holds.
 */
export function applyToggle(current: readonly string[], request: ToggleRequest, runIds: ReadonlySet<string>): ToggleOutcome {
  if (request.on && !runIds.has(request.id)) return { ok: false, error: "unknown_item" };
  const kept = current.filter((id) => runIds.has(id) && id !== request.id);
  const next = request.on ? [...kept, request.id] : kept;
  if (JSON.stringify(next).length > MAX_FAVOURITES_JSON) return { ok: false, error: "too_many" };
  return { ok: true, favourites: next };
}

/** The same list with the favourites first, each part keeping the order it came in (the current sort). */
export function favouritesFirst<T extends { id: string }>(items: readonly T[], favourites: ReadonlySet<string>): T[] {
  return [...items.filter((i) => favourites.has(i.id)), ...items.filter((i) => !favourites.has(i.id))];
}

/** How many of the run's items are favourites: the number on the chip. */
export function favouriteCount(items: readonly ScorecardItem[], favourites: ReadonlySet<string>): number {
  return items.filter((i) => favourites.has(i.id)).length;
}
