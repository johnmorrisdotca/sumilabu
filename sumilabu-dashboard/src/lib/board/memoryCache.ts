/**
 * A stand-in for Next's data cache (`unstable_cache`, `revalidateTag`) that
 * keeps its contract: an entry lives until a tag it carries is revalidated,
 * and a cached value comes back as JSON, the way the real one stores it (a
 * Date written into the cache is a string when read back).
 *
 * Not a test itself; a test installs it with
 * `vi.mock("next/cache", async () => (await import("@/lib/board/memoryCache")).memoryCache())`,
 * and `nextCacheStandIn` is then the same object, to clear between cases or
 * to count what was revalidated.
 */
export type CacheStandIn = {
  entries: Map<string, { tags: string[]; json: string }>;
  revalidated: string[];
  clear(): void;
  unstable_cache<T>(read: () => Promise<T>, keyParts: string[], options: { tags?: string[] }): () => Promise<T>;
  revalidateTag(tag: string, profile?: unknown): void;
};

export const nextCacheStandIn: CacheStandIn = {
  entries: new Map(),
  revalidated: [],
  clear() {
    this.entries.clear();
    this.revalidated.length = 0;
  },
  unstable_cache<T>(read: () => Promise<T>, keyParts: string[], options: { tags?: string[] }) {
    return async () => {
      const key = JSON.stringify(keyParts);
      const hit = nextCacheStandIn.entries.get(key);
      if (hit) return JSON.parse(hit.json) as T;
      const value = await read();
      nextCacheStandIn.entries.set(key, { tags: options.tags ?? [], json: JSON.stringify(value ?? null) });
      return value;
    };
  },
  revalidateTag(tag: string) {
    nextCacheStandIn.revalidated.push(tag);
    for (const [key, entry] of nextCacheStandIn.entries) if (entry.tags.includes(tag)) nextCacheStandIn.entries.delete(key);
  },
};

export function memoryCache() {
  return {
    unstable_cache: nextCacheStandIn.unstable_cache,
    revalidateTag: nextCacheStandIn.revalidateTag,
  };
}
