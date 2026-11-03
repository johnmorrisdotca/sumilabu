import type { Scorecard } from "./contract";
import { appLetters, familyLinks, mapGroups, unusedByApps, type FamilyLink } from "./map";

/*
 * Where everything sits on the package map (SUMILABU-11), in one 1000-wide
 * coordinate space. The shape follows John's 2026-11-02 map: the apps across
 * the top, the small families as tall capsules side by side, a big family as a
 * wide box of pills, the run-time links drawn between pills. Pure numbers, so
 * the layout has a test (no pill outside its box, no two pills on top of each
 * other, every link ending on a pill).
 */

export const MAP_WIDTH = 1000;
const MARGIN = 20;
const GAP = 22;
const APP_H = 54;
const HEAD = 78;
const PILL_H = 30;
const PILL_GAP = 10;
const PAD = 18;
const GRID_COLS = 6;
/** A family with more packages than this is drawn as a wide box of pills, not a tall capsule. */
export const TALL_MAX = 8;

export type PillBox = { id: string; group: string; x: number; y: number; w: number; h: number; letters: string[]; unused: boolean; hub: boolean };
export type GroupBox = { id: string; label: string; x: number; y: number; w: number; h: number; tall: boolean; count: number };
export type AppBox = { id: string; letter: string; name: string; note: string; x: number; y: number; w: number; h: number; groups: string[]; hasFamily: boolean };
export type LinkPath = FamilyLink & { d: string };

export type MapLayout = { width: number; height: number; apps: AppBox[]; groups: GroupBox[]; pills: PillBox[]; links: LinkPath[]; appLines: Array<{ app: string; group: string; d: string }>; hub: string | null };

/** The package more others lean on than any other (run time and demos together): kazoku-ui on today's map. */
export function hubPackage(doc: Pick<Scorecard, "items">): string | null {
  const counts = new Map<string, number>();
  for (const item of doc.items) {
    for (const id of new Set([...item.dependencies.family, ...item.dependencies.familyDev])) if (id !== item.id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [id, n] of counts) if (best === null || n > (counts.get(best) ?? 0) || (n === counts.get(best) && id < best)) best = id;
  return best && (counts.get(best) ?? 0) >= 3 ? best : null;
}

const r = (v: number) => Math.round(v * 10) / 10;

function linkPath(a: PillBox, b: PillBox, sameTall: boolean, sameGrid: boolean, bend: number): string {
  if (sameTall) {
    const x = a.x;
    const y1 = a.y + a.h / 2;
    const y2 = b.y + b.h / 2;
    const d = 16 + bend * 7;
    return `M${r(x)},${r(y1)} C${r(x - d)},${r(y1)} ${r(x - d)},${r(y2)} ${r(x)},${r(y2)}`;
  }
  if (sameGrid) {
    const x1 = a.x + a.w / 2;
    const x2 = b.x + b.w / 2;
    const y1 = a.y;
    const y2 = b.y;
    const lift = 16 + bend * 5;
    return `M${r(x1)},${r(y1)} C${r(x1)},${r(Math.min(y1, y2) - lift)} ${r(x2)},${r(Math.min(y1, y2) - lift)} ${r(x2)},${r(y2)}`;
  }
  const acx = a.x + a.w / 2;
  const bcx = b.x + b.w / 2;
  if (Math.abs(acx - bcx) > (a.w + b.w) / 2) {
    const right = bcx > acx;
    const x1 = right ? a.x + a.w : a.x;
    const x2 = right ? b.x : b.x + b.w;
    const y1 = a.y + a.h / 2;
    const y2 = b.y + b.h / 2;
    const mid = (x1 + x2) / 2;
    return `M${r(x1)},${r(y1)} C${r(mid)},${r(y1)} ${r(mid)},${r(y2)} ${r(x2)},${r(y2)}`;
  }
  const down = b.y > a.y;
  const y1 = down ? a.y + a.h : a.y;
  const y2 = down ? b.y : b.y + b.h;
  const mid = (y1 + y2) / 2;
  return `M${r(acx)},${r(y1)} C${r(acx)},${r(mid)} ${r(bcx)},${r(mid)} ${r(bcx)},${r(y2)}`;
}

export function mapLayout(doc: Pick<Scorecard, "items" | "groups" | "apps">): MapLayout {
  const groups = mapGroups(doc);
  const letters = appLetters(doc);
  const unused = unusedByApps(doc);
  const hub = hubPackage(doc);
  const inner = MAP_WIDTH - 2 * MARGIN;

  const mapApps = doc.apps.filter((a) => a.onMap);
  const appW = mapApps.length ? Math.min(230, (inner - GAP * (mapApps.length - 1)) / mapApps.length) : 0;
  const appRowW = mapApps.length * appW + Math.max(0, mapApps.length - 1) * GAP;
  const appX0 = MARGIN + (inner - appRowW) / 2;
  const groupOf = new Map(groups.flatMap((g) => g.items.map((i) => [i.id, g.id] as const)));
  const apps: AppBox[] = mapApps.map((a, i) => ({
    id: a.id,
    letter: a.letter,
    name: a.name,
    note: a.note,
    x: r(appX0 + i * (appW + GAP)),
    y: MARGIN,
    w: r(appW),
    h: APP_H,
    groups: [...new Set(a.family.map((id) => groupOf.get(id)).filter((g): g is string => Boolean(g)))],
    hasFamily: a.family.length > 0,
  }));

  let y = MARGIN + (apps.length ? APP_H + GAP * 2 : 0);
  const boxes: GroupBox[] = [];
  const pills: PillBox[] = [];
  const pill = (id: string, group: string, x: number, py: number, w: number) => pills.push({ id, group, x: r(x), y: r(py), w: r(w), h: PILL_H, letters: letters.get(id) ?? [], unused: unused.has(id), hub: id === hub });

  /* Tall capsules, up to three a row; a wide family on a row of its own. */
  const queue = [...groups];
  while (queue.length) {
    if (queue[0].items.length > TALL_MAX) {
      const g = queue.shift()!;
      const rows = Math.ceil(g.items.length / GRID_COLS);
      const h = HEAD + rows * (PILL_H + PILL_GAP) + PAD;
      boxes.push({ id: g.id, label: g.label, x: MARGIN, y, w: inner, h, tall: false, count: g.items.length });
      const pw = (inner - 2 * PAD - (GRID_COLS - 1) * PILL_GAP) / GRID_COLS;
      g.items.forEach((item, i) => pill(item.id, g.id, MARGIN + PAD + (i % GRID_COLS) * (pw + PILL_GAP), y + HEAD + Math.floor(i / GRID_COLS) * (PILL_H + PILL_GAP), pw));
      y += h + GAP;
      continue;
    }
    const row: typeof groups = [];
    while (queue.length && row.length < 3 && queue[0].items.length <= TALL_MAX) row.push(queue.shift()!);
    const w = (inner - 2 * GAP) / 3;
    const h = Math.max(...row.map((g) => HEAD + g.items.length * (PILL_H + PILL_GAP) + PAD));
    row.forEach((g, col) => {
      const x = MARGIN + col * (w + GAP);
      boxes.push({ id: g.id, label: g.label, x: r(x), y, w: r(w), h, tall: true, count: g.items.length });
      g.items.forEach((item, i) => pill(item.id, g.id, x + PAD * 1.6, y + HEAD + i * (PILL_H + PILL_GAP), w - PAD * 3.2));
    });
    y += h + GAP;
  }

  const at = new Map(pills.map((p) => [p.id, p]));
  const tallGroup = new Map(boxes.map((b) => [b.id, b.tall]));
  const bends = new Map<string, number>();
  const links: LinkPath[] = familyLinks(doc).flatMap((l) => {
    const a = at.get(l.from);
    const b = at.get(l.to);
    if (!a || !b) return [];
    const same = a.group === b.group;
    const key = `${a.group}:${same ? "in" : "out"}`;
    const bend = bends.get(key) ?? 0;
    bends.set(key, bend + 1);
    return [{ ...l, d: linkPath(a, b, same && Boolean(tallGroup.get(a.group)), same && !tallGroup.get(a.group), bend % 4) }];
  });

  const boxOf = new Map(boxes.map((b) => [b.id, b]));
  const appLines = apps.flatMap((a) =>
    a.groups.map((gid) => {
      const b = boxOf.get(gid)!;
      const x1 = a.x + a.w / 2;
      const y1 = a.y + a.h;
      const x2 = Math.min(Math.max(x1, b.x + 24), b.x + b.w - 24);
      const y2 = b.y;
      return { app: a.id, group: gid, d: `M${r(x1)},${r(y1)} C${r(x1)},${r((y1 + y2) / 2)} ${r(x2)},${r((y1 + y2) / 2)} ${r(x2)},${r(y2)}` };
    }),
  );

  return { width: MAP_WIDTH, height: r(y - GAP + MARGIN), apps, groups: boxes, pills, links, appLines, hub };
}
