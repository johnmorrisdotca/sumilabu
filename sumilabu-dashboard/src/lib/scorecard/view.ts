import type { Scorecard, ScorecardItem } from "./contract";

/*
 * What the page does with a document: order the columns, sort, filter, rank,
 * word the age. Pure, so every rule has a test and the component only draws.
 */

export const GRADE_ORDER: ReadonlyArray<{ id: string; label: string; long: string }> = [
  { id: "docs", label: "Docs", long: "Documentation" },
  { id: "dependencies", label: "Deps", long: "Dependencies" },
  { id: "robustness", label: "Robust", long: "Robustness" },
  { id: "tests", label: "Tests", long: "Tests" },
  { id: "bugs", label: "Bugs", long: "Bugs" },
  { id: "crashes", label: "Crashes", long: "Crashes and errors" },
  { id: "code", label: "Code", long: "Code quality" },
  { id: "lint", label: "Lint", long: "Lint" },
  { id: "performance", label: "Perf", long: "Performance" },
  { id: "usefulness", label: "Useful", long: "Usefulness" },
  { id: "freshness", label: "Fresh", long: "Freshness" },
];

export type GradeColumn = { id: string; label: string; long: string };

function titleCase(id: string): string {
  return id.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

/** The known grades in a fixed order, then any the collector added, with `overall` always last. */
export function gradeColumns(doc: Scorecard): GradeColumn[] {
  const present = new Set(doc.items.flatMap((i) => Object.keys(i.grades)));
  const known = GRADE_ORDER.filter((g) => present.has(g.id));
  const knownIds = new Set(GRADE_ORDER.map((g) => g.id));
  const extra = [...present]
    .filter((id) => !knownIds.has(id) && id !== "overall")
    .sort()
    .map((id) => ({ id, label: titleCase(id).slice(0, 8), long: titleCase(id) }));
  return [...known, ...extra, { id: "overall", label: "Overall", long: "Overall" }];
}

export function gradeLabel(id: string): string {
  return GRADE_ORDER.find((g) => g.id === id)?.long ?? (id === "overall" ? "Overall" : titleCase(id));
}

/** The overall to show and sort by: the collector's two-decimal score when it wrote one, else the whole-number grade. */
export function overallValue(item: ScorecardItem): number | null {
  const score = item.measures.overallScore;
  if (typeof score === "number") return score;
  return item.grades.overall ?? null;
}

export function itemVersion(item: ScorecardItem): string | null {
  return item.versions.npm ?? item.versions.repo ?? null;
}

/** Days since anything was last done: the last commit, else the last release. */
export function daysSinceUpdate(item: ScorecardItem): number | null {
  return item.dates.daysSinceCommit ?? item.dates.daysSinceRelease ?? null;
}

export type SortKey = "name" | "kind" | "owner" | "version" | "days" | "downloads" | "stars" | `grade:${string}`;
export type SortDir = "asc" | "desc";

function sortValue(item: ScorecardItem, key: SortKey): string | number | null {
  switch (key) {
    case "name":
      return item.name.toLowerCase();
    case "kind":
      return item.kind;
    case "owner":
      return item.owner.toLowerCase();
    case "version":
      return itemVersion(item);
    case "days":
      return daysSinceUpdate(item);
    case "downloads":
      return item.popularity.npmDownloadsWeek;
    case "stars":
      return item.popularity.stars;
    case "grade:overall":
      return overallValue(item);
    default:
      return item.grades[key.slice("grade:".length)] ?? null;
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.+-]/).map((p) => Number.parseInt(p, 10));
  const pb = b.split(/[.+-]/).map((p) => Number.parseInt(p, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = Number.isNaN(pa[i] ?? 0) ? 0 : (pa[i] ?? 0);
    const y = Number.isNaN(pb[i] ?? 0) ? 0 : (pb[i] ?? 0);
    if (x !== y) return x - y;
  }
  return 0;
}

/** A new array. A missing value sorts last whichever way the column runs, so a gap never reads as a best or a worst. */
export function sortItems(items: readonly ScorecardItem[], key: SortKey, dir: SortDir): ScorecardItem[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va === null && vb === null) return a.name.localeCompare(b.name);
    if (va === null) return 1;
    if (vb === null) return -1;
    const order = key === "version" ? compareVersions(String(va), String(vb)) : typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
    return order === 0 ? a.name.localeCompare(b.name) : order * sign;
  });
}

/** The direction a column opens in: names and ages ascend, the rest (bigger is better) descend. */
export function defaultDir(key: SortKey): SortDir {
  return key === "name" || key === "kind" || key === "owner" ? "asc" : "desc";
}

export type Filters = { kind: "all" | ScorecardItem["kind"]; owner: "all" | string; query: string; flaggedOnly: boolean };
export const NO_FILTERS: Filters = { kind: "all", owner: "all", query: "", flaggedOnly: false };

export function filterItems(items: readonly ScorecardItem[], filters: Filters): ScorecardItem[] {
  const q = filters.query.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.kind !== "all" && item.kind !== filters.kind) return false;
    if (filters.owner !== "all" && item.owner !== filters.owner) return false;
    if (filters.flaggedOnly && item.flags.length === 0) return false;
    if (q && !`${item.name} ${item.id} ${item.summary}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

export type Ranking = { best: ScorecardItem[]; worst: ScorecardItem[] };

const GRADE_PREFIX = "grade:";
/** Ranking ids the collector ranks by a reading, not a grade, even when a grade has the same name (`tests`). */
export const COLLECTOR_MEASURE_RANKINGS = ["downloads", "dependencyCount", "daysSinceCommit", "tests", "packedKb", "openBugTickets", "readmeWords"];

export type RankValue = number | boolean | string | null;

/** Where a ranking's number lives: the grade, a named reading, a popularity count, or a measure of the same name. */
export function rankValue(item: ScorecardItem, id: string): RankValue {
  /* "grade:tests" is the Tests grade; plain "tests" is the collector's ranking by number of tests. */
  if (id.startsWith(GRADE_PREFIX)) return item.grades[id.slice(GRADE_PREFIX.length)] ?? null;
  switch (id) {
    case "overall":
      return overallValue(item);
    case "downloads":
      return item.popularity.npmDownloadsMonth ?? item.popularity.npmDownloadsWeek;
    case "dependencyCount":
      return item.dependencies.runtime.length + item.dependencies.requiredPeers.length;
    case "daysSinceCommit":
      return item.dates.daysSinceCommit;
    case "packedKb":
      return item.dependencies.packedKb;
  }
  if (id in item.grades && !COLLECTOR_MEASURE_RANKINGS.includes(id)) return item.grades[id] ?? null;
  const m = item.measures[id];
  if (m !== undefined) return Array.isArray(m) ? null : m;
  const pop = item.popularity as Record<string, unknown>;
  return typeof pop[id] === "number" ? (pop[id] as number) : null;
}

const RANK_UNITS: Record<string, string> = { packedKb: " KB", daysSinceCommit: " d", downloads: " /30 d" };

export function formatRankValue(value: RankValue, id: string): string {
  const text = formatMeasure(value);
  return typeof value === "number" ? `${text}${RANK_UNITS[id] ?? ""}` : text;
}

const RANK_LABELS: Record<string, string> = {
  "grade:tests": "Tests (grade)",
  tests: "Number of tests",
  downloads: "Downloads, 30 days",
  dependencyCount: "Dependency count",
  daysSinceCommit: "Days since commit",
  packedKb: "Packed size",
  openBugTickets: "Open bug tickets",
  readmeWords: "README words",
};

/** Which entry of `methods` explains a ranking, when its id is not the method's id. */
export const RANK_METHOD: Record<string, string> = { "grade:tests": "tests", downloads: "npmDownloads", dependencyCount: "dependencies", daysSinceCommit: "freshness", packedKb: "performance", openBugTickets: "tickets", readmeWords: "docs" };

export function rankLabel(id: string): string {
  if (RANK_LABELS[id]) return RANK_LABELS[id];
  return GRADE_ORDER.some((g) => g.id === id) || id === "overall" ? gradeLabel(id) : measureLabel(id);
}

/** The collector's own ranking when it wrote one, else the top and bottom five by the grade; ids it names that no item has are skipped. */
export function rankingFor(doc: Scorecard, id: string, size = 5): Ranking {
  const byId = new Map(doc.items.map((i) => [i.id, i]));
  const gradeId = id.startsWith(GRADE_PREFIX) ? id.slice(GRADE_PREFIX.length) : null;
  if (gradeId !== null) return computedRanking(doc, gradeId, size);
  const given = doc.rankings[id];
  if (given) {
    const pick = (ids: string[]) => ids.map((x) => byId.get(x)).filter((x): x is ScorecardItem => Boolean(x)).slice(0, size);
    return { best: pick(given.best), worst: pick(given.worst) };
  }
  return computedRanking(doc, id, size);
}

function computedRanking(doc: Scorecard, gradeId: string, size: number): Ranking {
  const graded = doc.items.filter((i) => typeof i.grades[gradeId] === "number");
  const sorted = sortItems(graded, `grade:${gradeId}`, "desc");
  return { best: sorted.slice(0, size), worst: sorted.slice(-size).reverse() };
}

/** Every id that has a ranking: each grade column (the Tests grade as `grade:tests`, since the collector's `tests` ranks the number of tests), then the collector's reading rankings. */
export function rankingIds(doc: Scorecard, columns: readonly GradeColumn[]): string[] {
  const gradeIds = columns.map((c) => (c.id === "tests" ? `${GRADE_PREFIX}tests` : c.id));
  const extra = Object.keys(doc.rankings).filter((k) => !gradeIds.includes(k));
  return [...gradeIds, ...orderKeys(extra, COLLECTOR_MEASURE_RANKINGS)];
}

/** Four steps the colour scale is cut into; the cell also prints the number, so colour is never the only signal. */
export function gradeBand(value: number | null): "none" | "bad" | "poor" | "fair" | "good" | "great" {
  if (value === null) return "none";
  if (value < 4) return "bad";
  if (value < 5.5) return "poor";
  if (value < 7) return "fair";
  if (value < 8.5) return "good";
  return "great";
}

export function formatGrade(value: number | null): string {
  if (value === null) return "–";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatCount(value: number | null): string {
  if (value === null) return "–";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1000)}k`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

export function formatDays(days: number | null): string {
  if (days === null) return "–";
  return days === 0 ? "today" : `${days}d`;
}

/** "3 hours old", "2 days old" - how stale the data on screen is, given when it was generated. */
export function ageLabel(generatedAt: string, nowIso: string): string {
  const ms = Math.max(0, new Date(nowIso).getTime() - new Date(generatedAt).getTime());
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 2) return "just now";
  if (minutes < 120) return `${minutes} minutes old`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hours old`;
  return `${Math.floor(hours / 24)} days old`;
}

/** More than this and the collector has probably stopped running; the summary says so. */
export const STALE_RUN_DAYS = 8;

export function runIsStale(generatedAt: string, nowIso: string): boolean {
  return new Date(nowIso).getTime() - new Date(generatedAt).getTime() > STALE_RUN_DAYS * 24 * 60 * 60 * 1000;
}

/** The mean of the overall grades that exist, one decimal; null when none. */
export function averageOverall(items: readonly ScorecardItem[]): number | null {
  const values = items.map(overallValue).filter((v): v is number => typeof v === "number");
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

/** One item's overall grade across the kept runs, oldest first; a run that did not grade it is skipped. */
export function trendOf(trend: ReadonlyArray<{ overall: Record<string, number | null> }>, itemId: string): number[] {
  return trend.map((t) => t.overall[itemId]).filter((v): v is number => typeof v === "number");
}

export function formatMeasure(value: RankValue): string {
  if (value === null) return "not read";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString("en-US") : String(value);
  return value;
}

/* Postgres keeps JSON in its own key order (jsonb sorts by length, then
   alphabet), so every list drawn from an object's keys is put in an order here. */
const MEASURES: ReadonlyArray<readonly [string, string]> = [
  ["overallScore", "Overall score"],
  ["readmeWords", "README words"],
  ["readmeSections", "README sections"],
  ["docsSite", "Docs site"],
  ["docsPages", "Docs pages"],
  ["docsGuidesJa", "Japanese guides"],
  ["examplesTested", "Examples tested"],
  ["changelog", "Changelog"],
  ["sourceFiles", "Source files"],
  ["sourceLines", "Source lines"],
  ["testFiles", "Test files"],
  ["testLines", "Test lines"],
  ["tests", "Tests"],
  ["e2e", "End-to-end tests"],
  ["freezeTest", "Freeze test"],
  ["ciRunsLast30", "CI runs, 30 days"],
  ["ciFailuresLast30", "CI failures, 30 days"],
  ["ciLastFailedOnMain", "Last CI run on main failed"],
  ["openBugTickets", "Open bug tickets"],
  ["openTickets", "Open tickets"],
  ["crashTickets", "Crash tickets"],
  ["lintConfig", "Linter set up"],
  ["linter", "Linter"],
  ["formatter", "Formatter set up"],
  ["lintErrors", "Lint errors"],
  ["lintWarnings", "Lint warnings"],
  ["lintNote", "Lint note"],
  ["typescript", "TypeScript"],
  ["tsFraction", "TypeScript share of source"],
  ["tsStrict", "Strict mode"],
  ["typeErrors", "Type errors"],
  ["anyCount", "Uses of any"],
  ["anyPer1k", "Uses of any per 1,000 lines"],
  ["largestFile", "Largest file"],
  ["largestFileLines", "Largest file, lines"],
  ["filesOver600", "Files over 600 lines"],
  ["todoCount", "TODO comments"],
  ["consoleLogs", "console.log calls"],
  ["auditHigh", "High-severity audit findings"],
  ["auditModerate", "Moderate audit findings"],
  ["auditDevHigh", "High findings in dev tools"],
  ["bundleGzipKb", "Bundle, KB gzipped"],
  ["bundleEntry", "Bundle entry"],
  ["familyUsers", "Family items using it"],
  ["behindRepo", "Published version behind the repo"],
  ["demoStatus", "Demo HTTP status"],
  ["demoMs", "Demo response, ms"],
  ["siteStatus", "Site HTTP status"],
  ["siteMs", "Site response, ms"],
  ["siteKb", "Site page, KB"],
  ["siteChallenged", "Met Vercel's bot check"],
];

export function measureLabel(id: string): string {
  const known = MEASURES.find(([k]) => k === id);
  if (known) return known[1];
  const words = titleCase(id);
  return words.charAt(0) + words.slice(1).toLowerCase();
}

/** Keys in the order of `preferred`, then the rest alphabetically. */
export function orderKeys(keys: readonly string[], preferred: readonly string[]): string[] {
  const rank = (k: string) => {
    const i = preferred.indexOf(k);
    return i === -1 ? preferred.length : i;
  };
  return [...keys].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export const measureOrder = MEASURES.map(([k]) => k);
export const gradeOrder = [...GRADE_ORDER.map((g) => g.id), "overall"];
export const LINK_ORDER = ["repo", "npm", "demo", "site"];

const METHOD_LABELS: Record<string, string> = {
  npmDownloads: "npm downloads",
  outsideUse: "Use outside John's accounts",
  ciRuns: "CI runs",
  tickets: "Tickets",
  codeReadings: "Code readings",
  rankings: "Rankings",
};

export function methodLabel(id: string): string {
  return METHOD_LABELS[id] ?? gradeLabel(id);
}

/** Measures with a reading that can be blank for a reason the collector wrote down in `checkNotes`. */
export const CHECKED_MEASURES = ["lintErrors", "lintWarnings", "typeErrors", "auditHigh", "auditModerate", "auditDevHigh"];

/** Readings drawn some other way (a chart, a note), left out of the plain list of numbers. */
export const NOT_LISTED_MEASURES = ["downloadsDaily", "checkNotes"];

/** The `checkNotes` of an item as sentences, whatever else is in the measure. */
export function checkNotesOf(item: ScorecardItem): string[] {
  const notes = item.measures.checkNotes;
  return Array.isArray(notes) ? notes.filter((n): n is string => typeof n === "string") : [];
}

/** The 30 daily npm counts, oldest first, or null when there are none to draw. */
export function dailyDownloads(item: ScorecardItem): number[] | null {
  const d = item.measures.downloadsDaily;
  if (!Array.isArray(d)) return null;
  const nums = d.filter((n): n is number => typeof n === "number");
  return nums.length >= 2 ? nums : null;
}
