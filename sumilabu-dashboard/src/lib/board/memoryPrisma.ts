import { Prisma } from "@prisma/client";

/**
 * An in-memory stand-in for `prisma.boardTicket`, so the ticket routes can be
 * tested without a database. It answers only the calls and `where` shapes
 * `server.ts` makes, and it enforces the schema's two unique indexes - the id,
 * and (projectKey, key) with nulls distinct - by throwing the error Prisma
 * throws for Postgres, so a route's handling of a taken key is exercised
 * rather than assumed.
 *
 * Not a test itself (vitest runs `*.test.ts`); a test installs it with
 * `vi.mock("@/lib/prisma", ...)`, and runs against a real database by
 * leaving that mock out.
 */

type TicketRow = Record<string, unknown>;
type Where = Record<string, unknown>;
type Select = Record<string, boolean>;

const DEFAULTS: TicketRow = {
  projectKey: "default", key: null, detail: null, area: null, kind: "feature", status: "open", priority: null, effort: null,
  askedBy: null, claimedBy: null, claimedAt: null, releasedIn: null, releasedEntry: null, releasedAt: null, editedBy: null, editedAt: null,
};

function same(a: unknown, b: unknown): boolean {
  return a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;
}

function fieldMatches(actual: unknown, condition: unknown): boolean {
  if (condition === null || typeof condition !== "object" || condition instanceof Date) return same(actual, condition);
  const c = condition as { in?: unknown[]; not?: unknown; lt?: Date };
  if (c.in !== undefined && !c.in.some((value) => same(actual, value))) return false;
  if ("not" in c && same(actual, c.not)) return false;
  if (c.lt !== undefined && !(actual instanceof Date && actual.getTime() < c.lt.getTime())) return false;
  return true;
}

function matches(row: TicketRow, where: Where = {}): boolean {
  return Object.entries(where).every(([field, condition]) =>
    field === "OR" ? (condition as Where[]).some((branch) => matches(row, branch)) : fieldMatches(row[field], condition),
  );
}

function pick(row: TicketRow, select?: Select): TicketRow {
  if (!select) return { ...row };
  return Object.fromEntries(Object.keys(select).filter((field) => select[field]).map((field) => [field, row[field]]));
}

function defined(data: TicketRow): TicketRow {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

function uniqueViolation(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(`Unique constraint failed on the fields: (${target.join(",")})`, {
    code: "P2002",
    clientVersion: "memory",
    meta: { target },
  });
}

export function memoryPrisma() {
  let rows: TicketRow[] = [];
  let made = 0;

  function assertUnique(candidate: TicketRow, self?: TicketRow) {
    for (const row of rows) {
      if (row === self) continue;
      if (row.id === candidate.id) throw uniqueViolation(["id"]);
      if (candidate.key != null && row.projectKey === candidate.projectKey && row.key === candidate.key) {
        throw uniqueViolation(["projectKey", "key"]);
      }
    }
  }

  function create(data: TicketRow): TicketRow {
    const now = new Date();
    const row: TicketRow = { ...DEFAULTS, id: `memory-${++made}`, createdAt: now, movedAt: now, ...defined(data), updatedAt: now };
    assertUnique(row);
    rows.push(row);
    return { ...row };
  }

  function write(row: TicketRow, data: TicketRow) {
    const next = { ...row, ...defined(data), updatedAt: new Date() };
    assertUnique(next, row);
    Object.assign(row, next);
  }

  const boardTicket = {
    async findMany({ where, select }: { where?: Where; select?: Select; orderBy?: unknown } = {}) {
      return rows
        .filter((row) => matches(row, where))
        .sort((a, b) => (b.movedAt as Date).getTime() - (a.movedAt as Date).getTime())
        .map((row) => pick(row, select));
    },
    async findFirst({ where, select }: { where?: Where; select?: Select } = {}) {
      const row = rows.find((candidate) => matches(candidate, where));
      return row ? pick(row, select) : null;
    },
    async create({ data }: { data: TicketRow }) {
      return create(data);
    },
    async updateMany({ where, data }: { where?: Where; data: TicketRow }) {
      const targets = rows.filter((row) => matches(row, where));
      for (const row of targets) write(row, data);
      return { count: targets.length };
    },
    async upsert({ where, create: created, update }: { where: { id: string }; create: TicketRow; update: TicketRow }) {
      const row = rows.find((candidate) => candidate.id === where.id);
      if (!row) return create(created);
      write(row, update);
      return { ...row };
    },
    async deleteMany({ where }: { where?: Where } = {}) {
      const before = rows.length;
      rows = rows.filter((row) => !matches(row, where));
      return { count: before - rows.length };
    },
  };

  return { boardTicket };
}
