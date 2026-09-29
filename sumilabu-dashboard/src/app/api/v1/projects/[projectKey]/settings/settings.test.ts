import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE, GET as getOne, PUT } from "./[key]/route";
import { GET as list } from "./route";

/*
 * The settings routes against a counted in-memory `boardSetting` and a
 * stand-in for Next's data cache that keeps its contract: an entry lives
 * until a tag it carries is revalidated. What is under test is that a read
 * does not reach the database unless a setting in that project changed.
 */
const db = vi.hoisted(() => {
  type Row = { projectKey: string; key: string; value: string; setBy: string | null; updatedAt: Date };
  const rows = new Map<string, Row>();
  const reads = { count: 0 };
  const id = (projectKey: string, key: string) => `${projectKey}\u0000${key}`;
  const pick = ({ key, value, setBy, updatedAt }: Row) => ({ key, value, setBy, updatedAt });
  const boardSetting = {
    async findMany({ where }: { where: { projectKey: string } }) {
      reads.count += 1;
      return [...rows.values()].filter((r) => r.projectKey === where.projectKey).sort((a, b) => a.key.localeCompare(b.key)).map(pick);
    },
    async findUnique({ where }: { where: { projectKey_key: { projectKey: string; key: string } } }) {
      reads.count += 1;
      const row = rows.get(id(where.projectKey_key.projectKey, where.projectKey_key.key));
      return row ? pick(row) : null;
    },
    async upsert({ create, update }: { create: Row; update: { value: string; setBy: string } }) {
      const existing = rows.get(id(create.projectKey, create.key));
      const row = existing ? { ...existing, ...update, updatedAt: new Date() } : { ...create, updatedAt: new Date() };
      rows.set(id(row.projectKey, row.key), row);
      return pick(row);
    },
    async deleteMany({ where }: { where: { projectKey: string; key: string } }) {
      return { count: rows.delete(id(where.projectKey, where.key)) ? 1 : 0 };
    },
  };
  return { rows, reads, boardSetting };
});

const cache = vi.hoisted(() => {
  const entries = new Map<string, { tags: string[]; value: unknown }>();
  return {
    entries,
    unstable_cache<T>(read: () => Promise<T>, keyParts: string[], options: { tags: string[] }) {
      return async () => {
        const key = JSON.stringify(keyParts);
        const hit = entries.get(key);
        if (hit) return hit.value as T;
        const value = await read();
        entries.set(key, { tags: options.tags, value });
        return value;
      };
    },
    revalidateTag(tag: string) {
      for (const [key, entry] of entries) if (entry.tags.includes(tag)) entries.delete(key);
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: { boardSetting: db.boardSetting } }));
vi.mock("next/cache", () => ({ unstable_cache: cache.unstable_cache, revalidateTag: cache.revalidateTag }));

const TOKEN = "test-settings-token";
const ITS = "itsutsu-dev";
const UK = "umakuma-dev";
const KEY = "registration_mode";

type Body = { ok: boolean; error?: string; value?: string; settings?: Record<string, string> };

function request(method: string, path: string, { body, token = TOKEN }: { body?: unknown; token?: string } = {}) {
  const headers: Record<string, string> = { authorization: `Bearer ${token}`, "x-board-actor": "settings-test" };
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost/api/v1/projects/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function read(response: Response): Promise<{ status: number; json: Body }> {
  return { status: response.status, json: (await response.json()) as Body };
}

const inProject = (projectKey: string) => ({ params: Promise.resolve({ projectKey }) });
const onKey = (projectKey: string, key: string) => ({ params: Promise.resolve({ projectKey, key }) });

const getAll = async (projectKey: string, token?: string) =>
  read(await list(request("GET", `${projectKey}/settings`, { token }), inProject(projectKey)));
const getKey = async (projectKey: string, key: string, token?: string) =>
  read(await getOne(request("GET", `${projectKey}/settings/${key}`, { token }), onKey(projectKey, key)));
const put = async (projectKey: string, key: string, value: string) =>
  read(await PUT(request("PUT", `${projectKey}/settings/${key}`, { body: { value } }), onKey(projectKey, key)));
const del = async (projectKey: string, key: string) =>
  read(await DELETE(request("DELETE", `${projectKey}/settings/${key}`), onKey(projectKey, key)));

beforeEach(() => {
  vi.stubEnv("SETTINGS_TOKENS_JSON", JSON.stringify({ [ITS]: TOKEN, [UK]: TOKEN }));
  db.rows.clear();
  db.reads.count = 0;
  cache.entries.clear();
});

describe("settings reads do not wake the database", () => {
  it("answers a repeated list or key read from the cache", async () => {
    await put(ITS, KEY, "open");
    db.reads.count = 0;

    for (let i = 0; i < 5; i++) {
      expect((await getAll(ITS)).json.settings).toEqual({ [KEY]: "open" });
      expect((await getKey(ITS, KEY)).json.value).toBe("open");
    }
    expect(db.reads.count).toBe(2);
  });

  it("caches a key that is not set, so the default costs no query either", async () => {
    for (let i = 0; i < 5; i++) expect((await getKey(ITS, KEY)).status).toBe(404);
    expect(db.reads.count).toBe(1);
  });

  it("shows a PUT on the very next read of the list and the key", async () => {
    await put(ITS, KEY, "open");
    await getAll(ITS);
    await getKey(ITS, KEY);

    await put(ITS, KEY, "closed");
    expect((await getAll(ITS)).json.settings).toEqual({ [KEY]: "closed" });
    expect((await getKey(ITS, KEY)).json.value).toBe("closed");
  });

  it("shows a DELETE on the very next read", async () => {
    await put(ITS, KEY, "open");
    await getKey(ITS, KEY);

    expect((await del(ITS, KEY)).status).toBe(200);
    expect((await getKey(ITS, KEY)).status).toBe(404);
    expect((await getAll(ITS)).json.settings).toEqual({});
  });

  it("keeps each project's cache apart", async () => {
    await put(ITS, KEY, "open");
    await getKey(UK, KEY);
    await getKey(ITS, KEY);

    await put(UK, KEY, "closed");
    db.reads.count = 0;
    expect((await getKey(ITS, KEY)).json.value).toBe("open");
    expect(db.reads.count).toBe(0);
    expect((await getKey(UK, KEY)).json.value).toBe("closed");
  });

  it("still refuses a wrong token when the answer is cached", async () => {
    await put(ITS, KEY, "open");
    await getKey(ITS, KEY);
    await getAll(ITS);

    expect((await getKey(ITS, KEY, "wrong")).status).toBe(401);
    expect((await getAll(ITS, "wrong")).status).toBe(401);
  });
});
