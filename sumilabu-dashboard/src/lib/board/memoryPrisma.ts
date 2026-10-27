import { Prisma } from "@prisma/client";

import { createCounterStore, createRowStore, createTransactionLock, numberUnsettled } from "./memoryStore";

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
  projectKey: "default", key: null, seq: null, detail: null, area: null, kind: "feature", status: "open", priority: null, effort: null,
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
      if (candidate.seq != null && row.projectKey === candidate.projectKey && row.seq === candidate.seq) {
        throw uniqueViolation(["projectKey", "seq"]);
      }
    }
  }

  function create(data: TicketRow): TicketRow {
    const now = new Date();
    const row: TicketRow = { ...DEFAULTS, id: `memory-${++made}`, createdAt: now, movedAt: now, updatedAt: now, ...defined(data) };
    assertUnique(row);
    rows.push(row);
    return { ...row };
  }

  function write(row: TicketRow, data: TicketRow) {
    const next = { ...row, ...defined(data) };
    if (!(data.updatedAt instanceof Date)) next.updatedAt = new Date();
    assertUnique(next, row);
    Object.assign(row, next);
  }

  const boardTicket = {
    async findMany({ where, select, orderBy }: { where?: Where; select?: Select; orderBy?: unknown } = {}) {
      /* `createdAt asc, id asc` is the backfill's order (seq.ts); anything else is the board's `movedAt desc`. */
      const byCreation = Array.isArray(orderBy) && orderBy.some((term) => (term as Where).createdAt === "asc");
      return rows
        .filter((row) => matches(row, where))
        .sort((a, b) =>
          byCreation
            ? (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime() || String(a.id).localeCompare(String(b.id))
            : (b.movedAt as Date).getTime() - (a.movedAt as Date).getTime(),
        )
        .map((row) => pick(row, select));
    },
    async aggregate({ where }: { where?: Where; _max: { seq: true } }) {
      const seqs = rows.filter((row) => matches(row, where)).map((row) => row.seq).filter((seq): seq is number => typeof seq === "number");
      return { _max: { seq: seqs.length > 0 ? Math.max(...seqs) : null } };
    },
    async update({ where, data }: { where: { id: string }; data: TicketRow }) {
      const row = rows.find((candidate) => candidate.id === where.id);
      if (!row) throw new Error("memory ticket: no such row");
      write(row, data);
      return { ...row };
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

  /* Ticket images (images.ts). The foreign key's cascade is not mirrored:
     nothing the routes do deletes a ticket. */
  const boardTicketImage = createRowStore({ defaults: { addedBy: null }, idPrefix: "image" });

  /* The per-project counter (seq.ts) and the interactive transaction around it. */
  const boardTicketCounter = createCounterStore();
  const serialize = createTransactionLock();

  /** The one raw statement the code makes: seq.ts's set-based numbering (memoryStore.ts, `numberUnsettled`). */
  const executeRaw = (strings: TemplateStringsArray, ...values: unknown[]) => numberUnsettled(boardTicket, strings, values);

  type Tx = {
    boardTicket: typeof boardTicket;
    boardTicketCounter: typeof boardTicketCounter;
    boardTicketImage: typeof boardTicketImage;
    $executeRaw: typeof executeRaw;
  };

  return {
    boardTicket,
    boardTicketImage,
    boardTicketCounter,
    $executeRaw: executeRaw,
    /** Transactions run one at a time and roll back whole on a throw, as Postgres's row lock and rollback do. */
    $transaction<T>(fn: ((tx: Tx) => Promise<T>) | readonly unknown[]): Promise<T> {
      if (typeof fn !== "function") throw new Error("memory $transaction: pass a callback");
      return serialize(async () => {
        const tickets = [...rows];
        const counters = boardTicketCounter._snapshot();
        try {
          return await fn({ boardTicket, boardTicketCounter, boardTicketImage, $executeRaw: executeRaw });
        } catch (error) {
          rows = tickets;
          boardTicketCounter._restore(counters);
          throw error;
        }
      });
    },
  };
}
