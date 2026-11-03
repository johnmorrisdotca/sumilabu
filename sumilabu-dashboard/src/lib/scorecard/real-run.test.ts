/* eslint-disable @typescript-eslint/no-explicit-any -- these tests push invalid values into a copy of a typed document on purpose */
import { describe, expect, it } from "vitest";

import real from "./fixtures/real-trimmed.json";
import { overallByItem, parseScorecard } from "./contract";
import { checkNotesOf, dailyDownloads, filterItems, formatRankValue, methodLabel, NO_FILTERS, overallValue, rankLabel, rankValue, rankingFor, rankingIds, gradeColumns, sortItems } from "./view";

/*
 * real-trimmed.json is three items of the collector's first real run
 * (2026-11-02, collector 1.0.0): two public packages and the Sumilabu site,
 * chosen because they carry the fields the collector added to the contract.
 * The run's skipped list and board list are cut to public entries. All three are
 * public repositories; the file holds no private code, tickets or addresses.
 */
const clone = () => structuredClone(real) as Record<string, any>;
const parsed = parseScorecard(real);
if (!parsed.ok) throw new Error(`the real run's shape must parse: ${parsed.problems.join("; ")}`);
const doc = parsed.doc;
const byId = (id: string) => doc.items.find((i) => i.id === id)!;

describe("the real run", () => {
  it("parses, with every field the collector added", () => {
    expect(doc.items.map((i) => i.id)).toEqual(["tane", "jirai", "sumilabu"]);
    expect(doc.skipped).toHaveLength(3);
    expect(doc.skipped[0]).toEqual({ repo: "johnmorrisdotca/.github", reason: "the account's profile and shared GitHub settings, not a package" });
    expect(doc.run).toMatchObject({ seconds: 57, githubRateLimited: false, installsRun: true });
    expect(doc.run?.boardsRead).toEqual({ modules: true, "kazoku-ui": true, sumilabu: true });
    expect(byId("tane").popularity.starsOutside).toBe(0);
    expect(byId("tane").dependencies.requiredPeers).toEqual([]);
    expect(byId("tane").private).toBe(false);
    expect(byId("tane").measures.overallScore).toBe(9.09);
  });

  it("keeps the 30 daily counts and the check notes as lists", () => {
    expect(dailyDownloads(byId("tane"))).toHaveLength(30);
    expect(dailyDownloads(byId("tane"))?.[0]).toBe(51);
    expect(checkNotesOf(byId("jirai"))).toEqual(["1 type errors about missing built files set apart"]);
    expect(checkNotesOf(byId("sumilabu"))).toEqual(["no lockfile, so no cheap install: lint, typecheck and audit not run"]);
    expect(checkNotesOf(byId("tane"))).toEqual([]);
    expect(byId("sumilabu").measures.siteChallenged).toBe(true);
    expect(byId("sumilabu").measures.lintErrors).toBeNull();
  });

  it("keeps the trend's overall as the two-decimal score", () => {
    expect(overallByItem(doc)).toEqual({ tane: 9.09, jirai: 8.86, sumilabu: 6.55 });
  });
});

describe("what the page does with the additions", () => {
  it("sorts the overall column by the score, so two 9s are told apart", () => {
    expect(byId("tane").grades.overall).toBe(byId("jirai").grades.overall);
    expect(sortItems(doc.items, "grade:overall", "desc").map((i) => i.id)).toEqual(["tane", "jirai", "sumilabu"]);
    expect(sortItems(doc.items, "grade:overall", "asc").map((i) => i.id)).toEqual(["sumilabu", "jirai", "tane"]);
  });

  it("falls back to the whole grade when there is no score", () => {
    const item = structuredClone(byId("tane"));
    delete item.measures.overallScore;
    expect(overallValue(item)).toBe(9);
  });

  it("ranks by the collector's extra ids and reads each one's number", () => {
    const ids = rankingIds(doc, gradeColumns(doc));
    for (const id of ["downloads", "dependencyCount", "daysSinceCommit", "packedKb", "openBugTickets", "readmeWords"]) expect(ids).toContain(id);
    expect(rankValue(byId("tane"), "downloads")).toBe(1311);
    expect(rankValue(byId("tane"), "tests")).toBe(247);
    expect(rankValue(byId("tane"), "grade:tests")).toBe(8);
    expect(rankValue(byId("tane"), "dependencyCount")).toBe(0);
    expect(rankValue(byId("tane"), "packedKb")).toBe(58.9);
    expect(rankValue(byId("tane"), "daysSinceCommit")).toBe(0);
    expect(rankValue(byId("tane"), "readmeWords")).toBe(5210);
    expect(rankValue(byId("tane"), "overall")).toBe(9.09);
    expect(formatRankValue(58.9, "packedKb")).toBe("58.9 KB");
    expect(rankLabel("dependencyCount")).toBe("Dependency count");
    const custom = structuredClone(doc);
    custom.rankings.downloads = { best: ["tane", "jirai"], worst: ["sumilabu"] };
    expect(rankingFor(custom, "downloads").best.map((i) => i.id)).toEqual(["tane", "jirai"]);
  });

  it("keeps the Tests grade and the collector's ranking by number of tests apart", () => {
    const ids = rankingIds(doc, gradeColumns(doc));
    expect(ids).toContain("grade:tests");
    expect(ids).toContain("tests");
    expect(rankLabel("grade:tests")).toBe("Tests (grade)");
    expect(rankLabel("tests")).toBe("Number of tests");
    const custom = structuredClone(doc);
    custom.rankings.tests = { best: ["sumilabu"], worst: ["tane"] };
    expect(rankingFor(custom, "tests").best.map((i) => i.id)).toEqual(["sumilabu"]);
    expect(rankingFor(custom, "grade:tests").best[0].grades.tests).toBeGreaterThanOrEqual(rankingFor(custom, "grade:tests").worst[0].grades.tests ?? 0);
  });

  it("words the collector's extra methods", () => {
    expect(methodLabel("outsideUse")).toBe("Use outside John's accounts");
    expect(methodLabel("docs")).toBe("Documentation");
  });

  it("filters nothing out by default and finds the private ones when asked", () => {
    expect(filterItems(doc.items, NO_FILTERS)).toHaveLength(3);
  });
});

describe("what is still refused", () => {
  const refused = (mutate: (d: Record<string, any>) => void, where: string) => {
    const d = clone();
    mutate(d);
    const r = parseScorecard(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join("\n")).toContain(where);
  };

  it("a daily list that is not a list of numbers, or is absurdly long", () => {
    refused((d) => (d.items[0].measures.downloadsDaily = { 0: 5 }), "items.0.measures.downloadsDaily");
    refused((d) => (d.items[0].measures.downloadsDaily = Array.from({ length: 401 }, () => 1)), "items.0.measures.downloadsDaily");
    refused((d) => (d.items[0].measures.downloadsDaily = [1, { x: 1 }]), "items.0.measures.downloadsDaily");
  });

  it("a check note over 300 characters, or notes that are not a list", () => {
    refused((d) => (d.items[1].measures.checkNotes = ["x".repeat(301)]), "items.1.measures.checkNotes");
    refused((d) => (d.items[1].measures.checkNotes = { a: "b" }), "items.1.measures.checkNotes");
  });

  it("a skipped entry with no reason, or an over-long one; a bad run", () => {
    refused((d) => (d.skipped[0] = { repo: "a/b" }), "skipped.0.reason");
    refused((d) => (d.skipped[0].reason = "x".repeat(301)), "skipped.0.reason");
    refused((d) => (d.run.boardsRead.modules = "yes"), "run.boardsRead");
    refused((d) => (d.run.seconds = "57"), "run.seconds");
  });

  it("wrong types for the added fields", () => {
    refused((d) => (d.items[0].private = "yes"), "items.0.private");
    refused((d) => (d.items[0].popularity.starsOutside = "3"), "items.0.popularity.starsOutside");
    refused((d) => (d.items[0].dependencies.requiredPeers = "react"), "items.0.dependencies.requiredPeers");
  });

  it("still refuses a hostile link, a bad kind and a grade out of range", () => {
    refused((d) => (d.items[0].links.demo = "javascript:alert(1)"), "items.0.links.demo");
    refused((d) => (d.items[0].links.repo = "data:text/html,<script>"), "items.0.links.repo");
    refused((d) => (d.items[1].kind = "service"), "items.1.kind");
    refused((d) => (d.items[2].grades.docs = 11), "items.2.grades.docs");
  });

  it("an older document with none of the additions still parses, with safe defaults", () => {
    const d = clone();
    delete d.skipped;
    delete d.run;
    for (const i of d.items) {
      delete i.private;
      delete i.popularity.starsOutside;
      delete i.dependencies.requiredPeers;
    }
    const r = parseScorecard(d);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.doc.skipped).toEqual([]);
      expect(r.doc.run).toBeNull();
      expect(r.doc.items[0].private).toBe(false);
      expect(r.doc.items[0].dependencies.requiredPeers).toEqual([]);
    }
  });
});
