import type { Scorecard, ScorecardItem } from "./contract";
import { itemVersion } from "./view";

/*
 * The package map and its tables (SUMILABU-11), built from the scorecard run
 * so they stay current: John's 2026-11-02 document "How the packages fit
 * together" drawn from data, not copied. Pure; the components only draw.
 */

export const FAMILY_SCOPE = "@johnmorrisdotca/";

const familyName = (dep: string): string | null => (dep.startsWith(FAMILY_SCOPE) ? dep.slice(FAMILY_SCOPE.length) : null);

export type MapGroup = { id: string; label: string; items: ScorecardItem[] };

/** The families in the collector's order, each with its packages; a package of no listed family goes to the last, "other". */
export function mapGroups(doc: Pick<Scorecard, "items" | "groups">): MapGroup[] {
  const packages = doc.items.filter((i) => i.kind === "package");
  const known = new Set(doc.groups.map((g) => g.id));
  const groups: MapGroup[] = doc.groups.map((g) => ({ id: g.id, label: g.label, items: packages.filter((p) => p.group === g.id) }));
  const strays = packages.filter((p) => !p.group || !known.has(p.group));
  if (strays.length > 0) {
    const other = groups.find((g) => g.id === "other");
    if (other) other.items.push(...strays);
    else groups.push({ id: "other", label: "Other packages", items: strays });
  }
  return groups.filter((g) => g.items.length > 0);
}

export type FamilyLink = { from: string; to: string; optional: boolean };

/** What each package needs from another to run: a dependency or required peer is solid, an optional peer dashed. Dev-only use is not a link. */
export function familyLinks(doc: Pick<Scorecard, "items">): FamilyLink[] {
  const ids = new Set(doc.items.filter((i) => i.kind === "package").map((i) => i.id));
  const out: FamilyLink[] = [];
  for (const item of doc.items) {
    if (item.kind !== "package") continue;
    const seen = new Set<string>();
    const add = (deps: readonly string[], optional: boolean) => {
      for (const dep of deps) {
        const to = familyName(dep);
        if (!to || to === item.id || !ids.has(to) || seen.has(to)) continue;
        seen.add(to);
        out.push({ from: item.id, to, optional });
      }
    };
    add([...item.dependencies.runtime, ...item.dependencies.requiredPeers], false);
    add(item.dependencies.optionalPeers, true);
  }
  return out.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

/** Package id -> the letters of the apps on the map that run on it, in app order. */
export function appLetters(doc: Pick<Scorecard, "apps">): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const app of doc.apps) {
    if (!app.letter) continue;
    for (const id of app.family) out.set(id, [...(out.get(id) ?? []), app.letter]);
  }
  return out;
}

/** Packages no app runs on at all (drawn dashed on the map). */
export function unusedByApps(doc: Pick<Scorecard, "items" | "apps">): Set<string> {
  const used = new Set(doc.apps.flatMap((a) => a.family));
  return new Set(doc.items.filter((i) => i.kind === "package" && !used.has(i.id)).map((i) => i.id));
}

export type LibraryUse = "installed" | "peer" | "optional peer";
export type LibraryRow = { name: string; license: string | null; latest: string | null; how: LibraryUse; usedBy: string[]; groups: string[] };

const HOW_ORDER: Record<LibraryUse, number> = { installed: 0, peer: 1, "optional peer": 2 };

/** Every outside library a package needs or offers to use, with the strongest way any package takes it. */
export function packageLibraries(doc: Pick<Scorecard, "items" | "libraries">): LibraryRow[] {
  const rows = new Map<string, LibraryRow>();
  for (const item of doc.items) {
    if (item.kind !== "package") continue;
    const add = (deps: readonly string[], how: LibraryUse) => {
      for (const name of deps) {
        if (familyName(name)) continue;
        const row = rows.get(name) ?? { name, license: doc.libraries[name]?.license ?? null, latest: doc.libraries[name]?.latest ?? null, how, usedBy: [], groups: [] };
        if (HOW_ORDER[how] < HOW_ORDER[row.how]) row.how = how;
        if (!row.usedBy.includes(item.id)) row.usedBy.push(item.id);
        if (item.group && !row.groups.includes(item.group)) row.groups.push(item.group);
        rows.set(name, row);
      }
    };
    add(item.dependencies.runtime, "installed");
    add(item.dependencies.requiredPeers, "peer");
    add(item.dependencies.optionalPeers, "optional peer");
  }
  return [...rows.values()].sort((a, b) => HOW_ORDER[a.how] - HOW_ORDER[b.how] || b.usedBy.length - a.usedBy.length || a.name.localeCompare(b.name));
}

export type PackageRow = {
  item: ScorecardItem;
  version: string | null;
  familyRun: Array<{ id: string; range: string | null; optional: boolean }>;
  outsideRun: Array<{ name: string; optional: boolean }>;
  devOnly: Array<{ id: string; range: string | null }>;
};

/** "Package by package": what each one needs to run, inside the family and out, and what it uses only for demos and tests. */
export function packageRows(item: ScorecardItem): PackageRow {
  const d = item.dependencies;
  const ranges = d.familyRanges;
  const fam = (deps: readonly string[], optional: boolean) => deps.map(familyName).filter((x): x is string => Boolean(x) && x !== item.id).map((id) => ({ id, range: ranges[id] ?? null, optional }));
  const out = (deps: readonly string[], optional: boolean) => deps.filter((x) => !familyName(x)).map((name) => ({ name, optional }));
  return {
    item,
    version: itemVersion(item),
    familyRun: [...fam([...d.runtime, ...d.requiredPeers], false), ...fam(d.optionalPeers, true)],
    outsideRun: [...out([...d.runtime, ...d.requiredPeers], false), ...out(d.optionalPeers, true)],
    devOnly: d.familyDev.filter((id) => id !== item.id).map((id) => ({ id, range: ranges[id] ?? null })),
  };
}

/* ---- version ranges, enough of npm's rules to tell drift ---- */

type V = [number, number, number];

function parseVersion(v: string): V | null {
  const m = v.trim().replace(/^v/, "").match(/^(\d+)(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?/);
  if (!m) return null;
  const n = (s: string | undefined) => (s === undefined || /[xX*]/.test(s) ? -1 : Number(s));
  return [Number(m[1]), n(m[2]), n(m[3])];
}

function cmp(a: V, b: V): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

const fill = (v: V): V => [v[0], Math.max(0, v[1]), Math.max(0, v[2])];

/** The half-open interval [low, high) a single comparator allows, or null when it is not one we read. */
function interval(part: string): [V, V | null] | null {
  const p = part.trim();
  if (p === "" || p === "*" || p === "latest") return [[0, 0, 0], null];
  const op = p.match(/^(\^|~|>=|<=|>|<|=)?\s*(.+)$/);
  if (!op) return null;
  const v = parseVersion(op[2]);
  if (!v) return null;
  const low = fill(v);
  switch (op[1]) {
    case "^": {
      if (v[0] > 0 || v[1] === -1) return [low, [v[0] + 1, 0, 0]];
      if (v[1] > 0 || v[2] === -1) return [low, [0, v[1] + 1, 0]];
      return [low, [0, 0, v[2] + 1]];
    }
    case "~":
      return v[1] === -1 ? [low, [v[0] + 1, 0, 0]] : [low, [v[0], v[1] + 1, 0]];
    case ">=":
      return [low, null];
    case ">":
      return [[low[0], low[1], low[2] + 1], null];
    case "<":
      return [[0, 0, 0], low];
    case "<=":
      return [[0, 0, 0], [low[0], low[1], low[2] + 1]];
    default:
      if (v[1] === -1) return [low, [v[0] + 1, 0, 0]];
      if (v[2] === -1) return [low, [v[0], v[1] + 1, 0]];
      return [low, [low[0], low[1], low[2] + 1]];
  }
}

/**
 * Whether `version` is inside `range`: carets, tildes, exact, x-ranges,
 * comparator pairs and `||`. Null for anything else (a tag, a path, a
 * workspace link), which is "cannot tell", never "drift".
 */
export function satisfies(version: string, range: string): boolean | null {
  const v = parseVersion(version);
  if (!v || v[1] === -1 || v[2] === -1) return null;
  const r = range.trim();
  if (/^(workspace:|file:|link:|git|https?:|npm:)/.test(r)) return null;
  let readable = false;
  for (const alt of r.split("||")) {
    const parts = alt.trim().split(/\s+(?=[<>=^~]|\d)/).filter(Boolean);
    const intervals = (parts.length ? parts : [""]).map(interval);
    if (intervals.some((i) => i === null)) continue;
    readable = true;
    const ok = (intervals as Array<[V, V | null]>).every(([lo, hi]) => cmp(v, lo) >= 0 && (hi === null || cmp(v, hi) < 0));
    if (ok) return true;
  }
  return readable ? false : null;
}

/* ---- watch points ---- */

export type WatchPoint = { id: string; title: string; text: string; items: string[]; tickets: Array<{ id: string; title: string; url: string | null }> };

/** A packed package over this is a watch point: every install and every CI cache carries it. */
export const LARGE_PACKED_KB = 5 * 1024;
const PERMISSIVE = /^(MIT|ISC|0BSD|BSD-[23]-Clause|Apache-2\.0|Unlicense|CC0-1\.0|BlueOak-1\.0\.0)$/i;

function newerThan(a: string, b: string): boolean {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  return Boolean(va && vb && cmp(fill(va), fill(vb)) > 0);
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/**
 * What the data says to keep an eye on, each with the open tickets of the
 * items concerned whose titles are about it. Only what can be shown from the
 * run: a worry that is not in the data (two packages that must not depend on
 * each other, say) is not invented here.
 */
export function watchPoints(doc: Pick<Scorecard, "items" | "libraries">): WatchPoint[] {
  const packages = doc.items.filter((i) => i.kind === "package");
  const byId = new Map(packages.map((p) => [p.id, p]));
  const points: Array<Omit<WatchPoint, "tickets"> & { words: RegExp }> = [];

  /* Version drift: someone asks for a range the latest release is not in. */
  const drift = new Map<string, Array<{ who: string; range: string }>>();
  for (const item of doc.items) {
    for (const [dep, range] of Object.entries(item.dependencies.familyRanges)) {
      const target = byId.get(dep);
      const latest = target?.versions.npm;
      if (!target || !latest || dep === item.id) continue;
      if (satisfies(latest, range) === false) drift.set(dep, [...(drift.get(dep) ?? []), { who: item.id, range }]);
    }
  }
  for (const [dep, askers] of [...drift.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
    const latest = byId.get(dep)?.versions.npm;
    points.push({
      id: `drift:${dep}`,
      title: `${dep} versions drift`,
      text: `${list(askers.map((a) => `${a.who} asks for ${a.range}`))}, while ${latest} is out.`,
      items: [dep, ...askers.map((a) => a.who)],
      words: new RegExp(`${dep}|version|drift|bump|upgrade|\\^`, "i"),
    });
  }

  /* Released but behind the repository, and packages not on npm at all. */
  const behind = packages.filter((p) => p.versions.npm && p.versions.repo && newerThan(p.versions.repo, p.versions.npm));
  const notOnNpm = packages.filter((p) => !p.versions.npm);
  if (behind.length + notOnNpm.length > 0) {
    const parts = [
      ...behind.map((p) => `${p.id} is ${p.versions.npm} on npm and ${p.versions.repo} on GitHub`),
      ...notOnNpm.map((p) => `${p.id} is not on npm`),
    ];
    points.push({ id: "behind", title: "Released but behind GitHub", text: `${list(parts)}.`, items: [...behind, ...notOnNpm].map((p) => p.id), words: /release|publish|npm|version/i });
  }

  const large = packages.filter((p) => (p.dependencies.packedKb ?? 0) >= LARGE_PACKED_KB).sort((a, b) => (b.dependencies.packedKb ?? 0) - (a.dependencies.packedKb ?? 0));
  if (large.length > 0) {
    const mb = (kb: number | null) => (kb === null ? "?" : `${(kb / 1024).toFixed(1)} MB`);
    points.push({
      id: "size",
      title: "Package size",
      text: `${list(large.map((p) => `${p.id} is ${mb(p.dependencies.packedKb)} packed, ${mb(p.dependencies.unpackedKb)} unpacked`))}.`,
      items: large.map((p) => p.id),
      words: /size|packed|large|\bMB\b|smaller|shrink|weight/i,
    });
  }

  const red = doc.items.filter((i) => i.measures.ciLastFailedOnMain === true);
  if (red.length > 0) points.push({ id: "ci", title: "CI is red on main", text: `The last CI run on main failed for ${list(red.map((i) => i.id))}.`, items: red.map((i) => i.id), words: /\bCI\b|failing|red|workflow|build/i });

  const noLicence = packages.filter((p) => p.license === null);
  const unusual = packages.filter((p) => p.license !== null && !PERMISSIVE.test(p.license));
  const copyleftLibs = Object.entries(doc.libraries).filter(([, l]) => l.license && /MPL|GPL|CC-BY-SA|EPL|CDDL/i.test(l.license));
  if (noLicence.length + unusual.length + copyleftLibs.length > 0) {
    const parts = [
      ...noLicence.map((p) => `${p.id}'s package.json has no licence field`),
      ...unusual.map((p) => `${p.id} is ${p.license}`),
      ...copyleftLibs.map(([name, l]) => `the outside library ${name} is ${l.license}`),
    ];
    points.push({ id: "licence", title: "Licence fields", text: `${list(parts)}.`, items: [...noLicence, ...unusual].map((p) => p.id), words: /licen[cs]e|copyright|CC-BY/i });
  }

  return points.map(({ words, ...p }) => ({
    ...p,
    tickets: p.items
      .flatMap((id) => {
        const item = doc.items.find((i) => i.id === id);
        return item?.tickets ? [...item.tickets.list, ...item.tickets.urgent].filter((t) => t.status !== "done" && words.test(t.title)) : [];
      })
      .filter((t, i, all) => all.findIndex((x) => x.id === t.id) === i)
      .slice(0, 6)
      .map((t) => ({ id: t.id, title: t.title, url: t.url })),
  }));
}
