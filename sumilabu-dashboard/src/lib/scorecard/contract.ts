import { z } from "zod";

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
const grade = z.number().min(1).max(10).nullable();
const measureValue = z.union([z.number().finite(), z.boolean(), short(200), z.null()]);
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
  dependentsOutsideFamily: num,
  note: short(800).default(""),
});
const dependencies = z.object({
  runtime: stringList(100, 100),
  optionalPeers: stringList(100, 100),
  family: stringList(100, 100),
  dev: num,
  packedKb: num,
  unpackedKb: num,
});

const item = z.object({
  id: z.string().regex(/^[A-Za-z0-9._@/-]{1,100}$/, "an id is a repo name"),
  kind: z.enum(["package", "site", "app"]),
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
  facts: stringList(30, 400),
  flags: stringList(30, 200),
});

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

/** item id -> overall grade, the small thing kept per run for the trend. */
export function overallByItem(doc: Scorecard): Record<string, number | null> {
  return Object.fromEntries(doc.items.map((i) => [i.id, i.grades.overall ?? null]));
}
