import { Prisma } from "@prisma/client";

/**
 * The generic row store behind every in-memory Prisma stand-in in this repo
 * (`board/memoryPrisma.ts`, `reports/memoryPrisma.ts`). It answers only the
 * `where` shapes `server.ts` modules actually make (`OR`, `in`, `not`, `lt`)
 * and enforces the caller's own uniqueness rule by throwing Prisma's P2002,
 * the same error Postgres would give, so a route's handling of a collision is
 * exercised rather than assumed.
 */

export type Row = Record<string, unknown>;
export type Where = Record<string, unknown>;
export type Select = Record<string, boolean>;

export function same(a: unknown, b: unknown): boolean {
  return a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;
}

function fieldMatches(actual: unknown, condition: unknown): boolean {
  if (condition === null || typeof condition !== "object" || condition instanceof Date) return same(actual, condition);
  const c = condition as { in?: unknown[]; not?: unknown; lt?: Date; gt?: Date };
  if (c.in !== undefined && !c.in.some((value) => same(actual, value))) return false;
  if ("not" in c && same(actual, c.not)) return false;
  if (c.lt !== undefined && !(actual instanceof Date && actual.getTime() < c.lt.getTime())) return false;
  if (c.gt !== undefined && !(actual instanceof Date && actual.getTime() > c.gt.getTime())) return false;
  return true;
}

export function matches(row: Row, where: Where = {}): boolean {
  return Object.entries(where).every(([field, condition]) =>
    field === "OR" ? (condition as Where[]).some((branch) => matches(row, branch)) : fieldMatches(row[field], condition),
  );
}

function pick(row: Row, select?: Select): Row {
  if (!select) return { ...row };
  return Object.fromEntries(Object.keys(select).filter((field) => select[field]).map((field) => [field, row[field]]));
}

function defined(data: Row): Row {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

export function uniqueViolation(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(`Unique constraint failed on the fields: (${target.join(",")})`, {
    code: "P2002",
    clientVersion: "memory",
    meta: { target },
  });
}

export function createRowStore(options: { defaults: Row; idPrefix: string; assertUnique?: (candidate: Row, rows: readonly Row[], self?: Row) => void }) {
  let rows: Row[] = [];
  let made = 0;
  /* Real timestamps have millisecond resolution, so two rows created in the
     same test tick can tie on createdAt; a WeakMap-kept sequence (never an
     enumerable field, so it never leaks into a response) breaks the tie in
     creation order without pretending a real database's clock is finer than
     it is. */
  const sequence = new WeakMap<Row, number>();

  function assertUnique(candidate: Row, self?: Row) {
    options.assertUnique?.(candidate, rows, self);
  }

  function create(data: Row): Row {
    const now = new Date();
    const row: Row = { ...options.defaults, id: `${options.idPrefix}-${++made}`, createdAt: now, updatedAt: now, ...defined(data) };
    assertUnique(row);
    sequence.set(row, made);
    rows.push(row);
    return { ...row };
  }

  function write(row: Row, data: Row) {
    const next = { ...row, ...defined(data), updatedAt: new Date() };
    assertUnique(next, row);
    Object.assign(row, next);
  }

  return {
    /** For a `$transaction` stand-in: snapshot before, restore on rollback. */
    _snapshot: () => [...rows],
    _restore: (snapshot: readonly Row[]) => {
      rows = [...snapshot];
    },
    async findMany({ where, select, orderBy }: { where?: Where; select?: Select; orderBy?: { createdAt?: "asc" | "desc" } } = {}) {
      const dir = orderBy?.createdAt === "asc" ? 1 : -1;
      return rows
        .filter((row) => matches(row, where))
        .sort((a, b) => {
          const byTime = dir * ((a.createdAt as Date).getTime() - (b.createdAt as Date).getTime());
          return byTime !== 0 ? byTime : dir * ((sequence.get(a) ?? 0) - (sequence.get(b) ?? 0));
        })
        .map((row) => pick(row, select));
    },
    async findFirst({ where, select }: { where?: Where; select?: Select } = {}) {
      const row = rows.find((candidate) => matches(candidate, where));
      return row ? pick(row, select) : null;
    },
    async count({ where }: { where?: Where } = {}) {
      return rows.filter((row) => matches(row, where)).length;
    },
    async create({ data }: { data: Row }) {
      return create(data);
    },
    async updateMany({ where, data }: { where?: Where; data: Row }) {
      const targets = rows.filter((row) => matches(row, where));
      for (const row of targets) write(row, data);
      return { count: targets.length };
    },
    async upsert({ where, create: created, update }: { where: { id: string }; create: Row; update: Row }) {
      const row = rows.find((candidate) => candidate.id === where.id);
      if (!row) return create({ id: where.id, ...created });
      write(row, update);
      return { ...row };
    },
    async deleteMany({ where }: { where?: Where } = {}) {
      const before = rows.length;
      rows = rows.filter((row) => !matches(row, where));
      return { count: before - rows.length };
    },
  };
}

export type RowStore = ReturnType<typeof createRowStore>;
