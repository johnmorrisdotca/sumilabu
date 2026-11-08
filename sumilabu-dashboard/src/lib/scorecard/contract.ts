import { z } from "zod";

import { TICKET_LIMITS } from "@/lib/board/rules";

import { overallValue } from "./view";

/*
 * The package scorecard document (SUMILABU-6). The collector on John's Mac
 * writes it; docs/scorecard.md is the written contract and this is that
 * contract as code, checked on the way in and again on the way out of the
 * database, so a page never draws a shape it was not promised.
 *
 * The caps are the point of the shape: the document is shown on a public web
 * page, so a field is a short string, a number or a list of them, never HTML,
 * and a link must be https (`javascript:` in an href is the one way a stored
 * string could run). Unknown fields are dropped, not stored.
 */

export const SCORECARD_SCHEMA_VERSION = 1;
export const MAX_ITEMS = 200;

const short = (max: number) => z.string().max(max);
const num = z.number().finite().nullable().default(null);

function isHttps(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

const httpsLink = z.string().max(300).refine(isHttps, "must be an https address");

/** The three picture links (SUMILABU-8): the 1200x630 card, its dark twin, and the 512 px square. */
export const PICTURE_LINKS = ["thumbnail", "thumbnailDark", "icon"] as const;

/**
 * Where a picture may come from: GitHub Pages, raw.githubusercontent.com, or
 * the item's own site or demo host. Nothing else, because the page draws these
 * as <img> on John's private page and a picture on any host is a beacon that
 * says when he looked. No login in the address and no port, so a picture can
 * never be a request to something other than a plain web server.
 */
export function pictureHostAllowed(value: string, ownHosts: readonly string[]): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  if (host === "raw.githubusercontent.com") return true;
  if (/^[a-z0-9-]+\.github\.io$/.test(host)) return true;
  return ownHosts.includes(host);
}

function ownHosts(links: Record<string, string>): string[] {
  return ["site", "demo"].flatMap((k) => {
    try {
      return links[k] ? [new URL(links[k]).hostname.toLowerCase()] : [];
    } catch {
      return [];
    }
  });
}
const grade = z.number().min(1).max(10).nullable();
/* A reading is a number, a yes or no, a short text, or (downloadsDaily's 30 counts, checkNotes' sentences) a list of them. */
const measureValue = z.union([
  z.number().finite(),
  z.boolean(),
  short(200),
  z.array(z.union([z.number().finite(), short(300)])).max(400),
  z.null(),
]);
const familyId = z.string().regex(/^[a-z0-9._-]{1,100}$/);
const stringList = (maxItems: number, maxLength: number) => z.array(short(maxLength)).max(maxItems).default([]);

const versions = z.object({ npm: short(40).nullable().default(null), repo: short(40).nullable().default(null), count: num });
const dates = z.object({
  lastCommit: short(40).nullable().default(null),
  lastRelease: short(40).nullable().default(null),
  created: short(40).nullable().default(null),
  daysSinceCommit: num,
  daysSinceRelease: num,
});
const popularity = z.object({
  npmDownloadsWeek: num,
  npmDownloadsMonth: num,
  stars: num,
  forks: num,
  watchers: num,
  /** Stars and forks from accounts other than John's own two; `stars` and `forks` stay the totals. */
  starsOutside: num,
  forksOutside: num,
  dependentsOutsideFamily: num,
  note: short(800).default(""),
});
const dependencies = z.object({
  runtime: stringList(100, 100),
  optionalPeers: stringList(100, 100),
  requiredPeers: stringList(100, 100),
  family: stringList(100, 100),
  dev: num,
  packedKb: num,
  unpackedKb: num,
  /** Family packages in devDependencies only: demos and tests, never a user's install. */
  familyDev: stringList(100, 100),
  /** The version range each family dependency is asked for, as written: the drift watch point. */
  familyRanges: z.record(familyId, short(60)).refine((v) => Object.keys(v).length <= 100, "at most 100 ranges").default({}),
});

/* Tickets (SUMILABU-12). The boards give open tickets only, as text, so the
   dates, the done lists and "waiting on John" are null or empty until a board
   can say; null is "could not be read", never zero. */
export const TICKET_KINDS = ["bug", "feature", "chore", "other"] as const;
export const TICKET_PRIORITIES = ["critical", "high", "medium", "normal", "low", "unset"] as const;
const count = z.number().int().min(0).max(100_000);
const priorityCounts = z.object(Object.fromEntries(TICKET_PRIORITIES.map((p) => [p, count.default(0)])) as Record<(typeof TICKET_PRIORITIES)[number], z.ZodDefault<typeof count>>);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}/).max(40).nullable().default(null);
const ticket = z.object({
  id: short(100),
  title: short(160),
  kind: z.enum(TICKET_KINDS),
  kindDerived: z.boolean().default(false),
  priority: z.enum(TICKET_PRIORITIES).default("unset"),
  status: z.enum(["waiting", "in progress", "waiting on John", "done"]),
  created: day,
  done: day,
  url: httpsLink.nullable().default(null),
  claimedBy: short(80).nullable().default(null),
  detail: short(TICKET_LIMITS.detail).nullable().default(null),
});
const ticketsBlock = z.object({
  boards: stringList(20, 60),
  open: count,
  inProgress: count.default(0),
  waitingOnJohn: count.nullable().default(null),
  doneLast7: count.nullable().default(null),
  doneLast30: count.nullable().default(null),
  oldestOpenDays: count.nullable().default(null),
  openByKind: z
    .object(Object.fromEntries(TICKET_KINDS.map((k) => [k, priorityCounts.default(() => priorityCounts.parse({}))])) as Record<(typeof TICKET_KINDS)[number], z.ZodDefault<typeof priorityCounts>>)
    .default(() => ({}) as never),
  urgent: z.array(ticket).max(40).default([]),
  recentDone: z.array(ticket).max(40).default([]),
  /** Every ticket the boards gave for the item, open first (SUMILABU-12). */
  list: z.array(ticket).max(400).default([]),
});
export type TicketsBlock = z.output<typeof ticketsBlock>;
export type Ticket = z.output<typeof ticket>;


const item = z.object({
  id: z.string().regex(/^[A-Za-z0-9._@/-]{1,100}$/, "an id is a repo name"),
  kind: z.enum(["package", "site", "app"]),
  /** A private repository: CI, demos or downloads may be blank because they cannot be read from outside. */
  private: z.boolean().default(false),
  owner: short(60),
  name: short(120),
  summary: short(400).default(""),
  links: z.record(short(30), httpsLink).refine((v) => Object.keys(v).length <= 12, "at most 12 links").default({}),
  versions: versions.default(() => versions.parse({})),
  dates: dates.default(() => dates.parse({})),
  popularity: popularity.default(() => popularity.parse({})),
  dependencies: dependencies.default(() => dependencies.parse({})),
  measures: z.record(short(40), measureValue).refine((v) => Object.keys(v).length <= 80, "at most 80 measures").default({}),
  grades: z.record(short(30), grade).refine((v) => Object.keys(v).length <= 30, "at most 30 grades"),
  gradeNotes: z.record(short(30), short(600)).default({}),
  facts: stringList(30, 600),
  flags: stringList(30, 200),
  /** Which family of the package map (SUMILABU-11); null for sites and apps. */
  group: z.string().regex(/^[a-z0-9-]{1,40}$/).nullable().default(null),
  /** The licence the package.json declares; null when it declares none. */
  license: short(100).nullable().default(null),
  tickets: ticketsBlock.nullable().default(null),
}).superRefine((value, ctx) => {
  const own = ownHosts(value.links);
  for (const key of PICTURE_LINKS) {
    const link = value.links[key];
    if (link !== undefined && !pictureHostAllowed(link, own)) ctx.addIssue({ code: "custom", path: ["links", key], message: "a picture must be on github.io, raw.githubusercontent.com or the item's own site" });
  }
});

const skipped = z.object({ repo: short(120), reason: short(300) });
const run = z.object({
  seconds: num,
  githubRateLimited: z.boolean().default(false),
  boardsRead: z.record(short(60), z.boolean()).refine((v) => Object.keys(v).length <= 60, "at most 60 boards").default({}),
  installsRun: z.boolean().default(false),
});

const group = z.object({ id: z.string().regex(/^[a-z0-9-]{1,40}$/), label: short(60) });
const app = z.object({
  id: z.string().regex(/^[A-Za-z0-9._-]{1,60}$/),
  letter: short(2).default(""),
  name: short(120),
  note: short(200).default(""),
  item: short(100).nullable().default(null),
  private: z.boolean().default(false),
  onMap: z.boolean().default(false),
  family: z.array(familyId).max(100).default([]),
  outside: stringList(60, 100),
});
const library = z.object({ license: short(100).nullable().default(null), latest: short(40).nullable().default(null) });

const ranking = z.object({ best: z.array(short(100)).max(60).default([]), worst: z.array(short(100)).max(60).default([]) });

export const scorecardSchema = z.object({
  schemaVersion: z.literal(SCORECARD_SCHEMA_VERSION),
  generatedAt: z.iso.datetime({ offset: true }),
  generator: z.object({ name: short(60), version: short(30) }),
  methods: z.record(short(40), short(1200)).refine((v) => Object.keys(v).length <= 80, "at most 80 methods").default({}),
  items: z
    .array(item)
    .max(MAX_ITEMS)
    .refine((items) => new Set(items.map((i) => i.id)).size === items.length, "item ids must be unique"),
  rankings: z.record(short(40), ranking).refine((v) => Object.keys(v).length <= 80, "at most 80 rankings").default({}),
  /** The repositories left out of the run and why. */
  skipped: z.array(skipped).max(300).default([]),
  /** How the run went: time, rate limits, which ticket boards were read. */
  run: run.nullable().default(null),
  /** The families of the package map, in the order they are drawn (SUMILABU-11). */
  groups: z.array(group).max(20).default([]),
  /** Each site or app and the family packages it runs on; `letter` is its badge on the map. */
  apps: z.array(app).max(20).default([]),
  /** Licence and latest version of every outside library a package or app names. */
  libraries: z.record(short(100), library).refine((v) => Object.keys(v).length <= 400, "at most 400 libraries").default({}),
  /** Tickets on shared boards that name no item. */
  familyTickets: ticketsBlock.nullable().default(null),
});

export type ScorecardItem = z.output<typeof item>;
export type Scorecard = z.output<typeof scorecardSchema>;

export type ParseResult = { ok: true; doc: Scorecard } | { ok: false; problems: string[] };

/** The document, or up to ten short sentences saying what is wrong with it. */
export function parseScorecard(input: unknown): ParseResult {
  const parsed = scorecardSchema.safeParse(input);
  if (parsed.success) return { ok: true, doc: parsed.data };
  const problems = parsed.error.issues.slice(0, 10).map((issue) => `${issue.path.join(".") || "(document)"}: ${issue.message}`);
  return { ok: false, problems };
}

/** item id -> overall, the small thing kept per run for the trend. */
export function overallByItem(doc: Scorecard): Record<string, number | null> {
  return Object.fromEntries(doc.items.map((i) => [i.id, overallValue(i)]));
}
