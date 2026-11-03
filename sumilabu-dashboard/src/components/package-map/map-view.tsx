"use client";

import { useEffect, useState } from "react";

import type { Scorecard } from "@/lib/scorecard/contract";

import { OutsideDependencies, PackagesByFamily, WatchPoints } from "./map-tables";
import { PackageMap } from "./package-map";

export const MAP_TABS = [
  { id: "map", label: "Map" },
  { id: "packages", label: "Package by package" },
  { id: "outside", label: "Outside dependencies" },
  { id: "watch", label: "Watch points" },
] as const;
type MapTab = (typeof MAP_TABS)[number]["id"];

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-stone-900 bg-stone-900 text-stone-50 dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900" : "border-stone-300 bg-white/80 text-stone-700 hover:border-stone-500 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200"}`;

const fromHash = (): MapTab | null => {
  const tab = new URLSearchParams(window.location.hash.slice(1)).get("tab");
  return MAP_TABS.some((t) => t.id === tab) ? (tab as MapTab) : null;
};

/** The four views of John's package document as tabs on one screen; the tab is in the address (#tab=watch) so a link opens it. */
export function MapView({ doc, favourites }: { doc: Scorecard; favourites: readonly string[] }) {
  const [tab, setTab] = useState<MapTab>("map");
  useEffect(() => {
    const sync = () => setTab(fromHash() ?? "map");
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const favs = new Set(favourites);
  const pick = (next: MapTab) => {
    setTab(next);
    history.replaceState(null, "", `#tab=${next}`);
  };
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <div role="tablist" aria-label="Package map views" className="flex flex-wrap gap-2 print:hidden">
        {MAP_TABS.map((t) => (
          <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => pick(t.id)} className={chip(tab === t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "map" ? <PackageMap doc={doc} favourites={favourites} /> : null}
      {tab === "packages" ? <PackagesByFamily doc={doc} favourites={favs} /> : null}
      {tab === "outside" ? <OutsideDependencies doc={doc} favourites={favs} /> : null}
      {tab === "watch" ? <WatchPoints doc={doc} /> : null}
    </div>
  );
}
