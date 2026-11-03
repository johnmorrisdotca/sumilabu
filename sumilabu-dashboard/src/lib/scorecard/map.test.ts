import { describe, expect, it } from "vitest";

import { parseScorecard } from "./contract";
import run from "./fixtures/map-run.json";
import { appLetters, familyLinks, mapGroups, packageLibraries, packageRows, satisfies, unusedByApps, watchPoints } from "./map";
import { hubPackage, mapLayout } from "./map-layout";

const parsed = parseScorecard(run);
if (!parsed.ok) throw new Error(parsed.problems.join("; "));
const doc = parsed.doc;

/* John's map of 2026-11-02 (~/Projects/backups/package-scorecard/reference/README.md, "Run-time links"). */
const REFERENCE = [
  ["wakusei-planets", "chikyu-earth", true],
  ["wakusei-planets", "kazoku-ui", false],
  ["chikyu-earth", "kazoku-ui", true],
  ["fuda-cards", "kazoku-ui", false],
  ["chikyu-earth", "chizu", false],
  ["meigen-sports", "koyomi-calendars", false],
  ["taisen-brackets", "dougu-sports", true],
  ["taisen-brackets", "hata", true],
  ["kyogijo-stadiums", "hata", true],
  ["tenka", "korokoro", true],
  ["tenka", "toranpu", true],
] as const;

describe("the map's links, from the run", () => {
  const links = familyLinks(doc);
  const key = (l: { from: string; to: string; optional: boolean }) => `${l.from}>${l.to}${l.optional ? " (optional)" : ""}`;

  it("has every link of John's map, solid and dashed as he drew them", () => {
    for (const [from, to, optional] of REFERENCE) expect(links.map(key)).toContain(key({ from, to, optional }));
  });

  it("has only those links among the families on his map; the one extra comes from rest-in-pieces, which is in no family there", () => {
    const extra = links.filter((l) => !REFERENCE.some(([f, t]) => f === l.from && t === l.to));
    expect([...new Set(extra.map((l) => l.from))]).toEqual(["rest-in-pieces"]);
  });

  it("puts each app's letter on the packages it runs on", () => {
    const letters = appLetters(doc);
    expect(letters.get("hako-devices")).toEqual(["C"]);
    expect(letters.get("hata")).toEqual(["I", "H"]);
    expect(letters.get("chizu")).toEqual(["I"]);
    expect(letters.get("kuni")).toEqual(["I"]);
    expect(letters.get("tenka")).toEqual(["I"]);
  });

  it("knows which packages no app uses", () => {
    const unused = unusedByApps(doc);
    expect(unused.has("tenka")).toBe(false);
    expect(unused.has("kazoku-ui")).toBe(true);
  });

  it("groups the packages in the families of the map, in order", () => {
    const groups = mapGroups(doc);
    expect(groups.map((g) => g.id)).toEqual(["3d-views", "maps-addresses", "sports-flags", "games-words", "other"]);
    expect(groups[0].items.map((i) => i.id).sort()).toEqual(["chikyu-earth", "fuda-cards", "hako-devices", "kazoku-ui", "uchusen-rockets", "wakusei-planets"]);
    expect(groups[1].items).toHaveLength(4);
    expect(groups[2].items).toHaveLength(7);
  });

  it("finds the package the others lean on", () => {
    expect(hubPackage(doc)).toBe("kazoku-ui");
  });
});

describe("the tables", () => {
  it("says what a package needs to run and what only its demos use", () => {
    const row = packageRows(doc.items.find((i) => i.id === "chikyu-earth")!);
    expect(row.familyRun.map((d) => `${d.id}${d.optional ? "?" : ""}`)).toEqual(["chizu", "kazoku-ui?"]);
    expect(row.outsideRun.map((d) => d.name)).toContain("d3-geo");
    expect(row.outsideRun.find((d) => d.name === "three")?.optional).toBe(true);
  });

  it("lists the outside libraries with how they are taken and by whom", () => {
    const libs = packageLibraries(doc);
    const d3 = libs.find((l) => l.name === "d3-geo")!;
    expect(d3).toMatchObject({ how: "installed", usedBy: ["chikyu-earth"], groups: ["3d-views"] });
    expect(d3.license).toBe("ISC");
    expect(libs.find((l) => l.name === "three")!.how).toBe("optional peer");
    expect(libs[0].how).toBe("installed");
  });
});

describe("version ranges", () => {
  it.each([
    ["0.10.1", "^0.10.0", true],
    ["0.10.1", "^0.9.0", false],
    ["0.10.1", "^0.2.1", false],
    ["1.4.0", "^1.2.0", true],
    ["2.0.0", "^1.2.0", false],
    ["0.0.4", "^0.0.3", false],
    ["1.2.9", "~1.2.0", true],
    ["1.3.0", "~1.2.0", false],
    ["0.9.0", "0.5.0", false],
    ["0.5.0", "0.5.0", true],
    ["1.5.0", ">=1.2.0 <2.0.0", true],
    ["2.1.0", "^1.0.0 || ^2.0.0", true],
    ["3.0.0", "1.x", false],
    ["1.9.0", "1.x", true],
    ["1.0.0", "*", true],
  ])("%s in %s is %s", (version, range, expected) => {
    expect(satisfies(version, range)).toBe(expected);
  });

  it("cannot tell a tag, a path or a workspace link, and says so with null, never drift", () => {
    for (const range of ["workspace:*", "file:../x", "latest-beta", "github:a/b"]) expect(satisfies("1.0.0", range)).toBeNull();
  });
});

describe("watch points", () => {
  const points = watchPoints(doc);

  it("finds the kazoku-ui and chikyu-earth drift from the ranges packages ask for (the run's ranges, not the 2026-11-02 document's)", () => {
    const drift = points.find((p) => p.id === "drift:kazoku-ui");
    expect(drift).toBeDefined();
    expect(drift!.text).toContain("senshu-jerseys asks for ^0.7.3");
    expect(drift!.text).not.toContain("fuda-cards");
    expect(drift!.text).toContain(`while ${doc.items.find((i) => i.id === "kazoku-ui")!.versions.npm} is out`);
    expect(points.find((p) => p.id === "drift:chikyu-earth")?.text).toContain("uchusen-rockets asks for 0.5.0");
  });

  it("names a package without a licence field, and a large one", () => {
    expect(points.find((p) => p.id === "licence")?.text).toContain("fuda-cards's package.json has no licence field");
    expect(points.find((p) => p.id === "size")?.items).toContain("uchusen-rockets");
  });

  it("invents nothing: a point is only what the run shows", () => {
    for (const p of points) expect(p.items.length).toBeGreaterThan(0);
  });
});

describe("the map's layout", () => {
  const layout = mapLayout(doc);

  it("has one pill per package, inside its family's box, none on top of another", () => {
    expect(layout.pills).toHaveLength(doc.items.filter((i) => i.kind === "package").length);
    for (const p of layout.pills) {
      const box = layout.groups.find((g) => g.id === p.group)!;
      expect(p.x).toBeGreaterThanOrEqual(box.x);
      expect(p.x + p.w).toBeLessThanOrEqual(box.x + box.w + 0.1);
      expect(p.y + p.h).toBeLessThanOrEqual(box.y + box.h);
    }
    for (const a of layout.pills) for (const b of layout.pills) if (a !== b) expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
  });

  it("draws every link between two pills, and fits the drawing", () => {
    expect(layout.links).toHaveLength(familyLinks(doc).length);
    for (const l of layout.links) expect(l.d).toMatch(/^M[\d.,-]+ C/);
    expect(Math.max(...layout.groups.map((g) => g.y + g.h))).toBeLessThanOrEqual(layout.height);
    expect(layout.apps.map((a) => a.letter)).toEqual(["I", "C", "H", ""]);
  });
});
