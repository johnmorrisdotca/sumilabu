import { describe, expect, it } from "vitest";

import { MAX_FAVOURITES_JSON, applyToggle, favouritesFirst, readFavourites, readToggle } from "./favourites";

const run = new Set(["tane", "jirai", "chizu", "kuni"]);

describe("the stored hearts", () => {
  it("reads a list of ids and drops anything that is not one", () => {
    expect(readFavourites('["tane","jirai","tane",3,"bad id",null]')).toEqual(["tane", "jirai"]);
    expect(readFavourites("not json")).toEqual([]);
    expect(readFavourites('{"tane":true}')).toEqual([]);
    expect(readFavourites(null)).toEqual([]);
  });
});

describe("a press", () => {
  it("takes exactly { id, on }", () => {
    expect(readToggle({ id: "tane", on: true })).toEqual({ id: "tane", on: true });
    for (const bad of [null, [], "tane", { id: "tane" }, { id: "tane", on: "yes" }, { id: "<script>", on: true }, { id: "a b", on: true }, { id: "x".repeat(101), on: true }]) expect(readToggle(bad)).toBeNull();
  });

  it("adds an id of the current run, at the end, once", () => {
    expect(applyToggle(["tane"], { id: "jirai", on: true }, run)).toEqual({ ok: true, favourites: ["tane", "jirai"] });
    expect(applyToggle(["tane"], { id: "tane", on: true }, run)).toEqual({ ok: true, favourites: ["tane"] });
  });

  it("refuses to add an id the run does not have", () => {
    expect(applyToggle(["tane"], { id: "not-in-run", on: true }, run)).toEqual({ ok: false, error: "unknown_item" });
  });

  it("removes any id, and drops ids that left the run", () => {
    expect(applyToggle(["gone", "tane", "jirai"], { id: "tane", on: false }, run)).toEqual({ ok: true, favourites: ["jirai"] });
    expect(applyToggle(["gone"], { id: "gone", on: false }, run)).toEqual({ ok: true, favourites: [] });
  });

  it("refuses a list that would not fit the settings row", () => {
    const big = new Set(Array.from({ length: 400 }, (_, i) => `package-number-${i}`));
    const current = [...big].slice(0, 399);
    const out = applyToggle(current, { id: "package-number-399", on: true }, big);
    expect(JSON.stringify(current).length).toBeGreaterThan(MAX_FAVOURITES_JSON);
    expect(out).toEqual({ ok: false, error: "too_many" });
  });
});

describe("favourites first", () => {
  it("puts the favourites on top and keeps both parts in the order they came (the current sort)", () => {
    const items = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
    expect(favouritesFirst(items, new Set(["d", "b"])).map((i) => i.id)).toEqual(["b", "d", "a", "c", "e"]);
    expect(favouritesFirst(items, new Set()).map((i) => i.id)).toEqual(["a", "b", "c", "d", "e"]);
  });
});
