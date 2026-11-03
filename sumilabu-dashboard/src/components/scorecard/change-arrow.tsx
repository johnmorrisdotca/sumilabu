"use client";

import { createContext, useContext } from "react";

import { changeTitle, changeWords, figureDef, formatFigure, moveOf, type Comparison, type Pair } from "@/lib/scorecard/changes";

/*
 * The arrows of SUMILABU-14. The arrow is the way a figure moved (for rank,
 * up is climbing); the colour is whether that is good for that figure, so
 * more bugs is a red up arrow and fewer is a green down arrow. Never colour
 * alone: the arrow's shape, a sign and the amount are printed, and a screen
 * reader hears "rank up 3 places since 2 Nov". Where nothing changed nothing
 * is drawn.
 */

export type ChangesView = { comparison: Comparison | null; since: string };

/** The comparison the page is showing, so a cell anywhere can find its item's change without it being passed down. */
export const ChangesContext = createContext<ChangesView>({ comparison: null, since: "" });

const GOOD = "text-emerald-700 dark:text-emerald-400";
const BAD = "text-red-700 dark:text-red-400";

export function ChangeArrow({ figure, pair, since, size = "sm" }: { figure: string; pair: Pair | undefined; since: string; size?: "xs" | "sm" | "md" }) {
  if (!pair) return null;
  const def = figureDef(figure);
  const m = moveOf(def, pair);
  const text = size === "xs" ? "text-[10px] leading-3" : size === "md" ? "text-sm" : "text-xs";
  return (
    <span className={`inline-flex items-center whitespace-nowrap font-semibold tabular-nums ${text} ${m.good ? GOOD : BAD}`} title={changeTitle(def, pair, since)} data-change={figure} data-good={m.good ? "yes" : "no"}>
      <span aria-hidden="true">
        {m.arrow}
        {m.sign}
        {m.amount}
      </span>
      <span className="sr-only">{changeWords(def, pair, since)}</span>
    </span>
  );
}

/** One item's change of one figure, from the comparison on show. */
export function ItemChange({ item, figure, size }: { item: string; figure: string; size?: "xs" | "sm" | "md" }) {
  const { comparison, since } = useContext(ChangesContext);
  return <ChangeArrow figure={figure} pair={comparison?.items[item]?.[figure]} since={since} size={size} />;
}

/** "#4 ▲+3": the item's place by overall, shown only when it moved. */
export function RankChange({ item, size = "xs" }: { item: string; size?: "xs" | "sm" | "md" }) {
  const { comparison, since } = useContext(ChangesContext);
  const pair = comparison?.items[item]?.rank;
  if (!pair) return null;
  return (
    <span className="inline-flex items-center gap-0.5 whitespace-nowrap" data-testid="rank-change">
      <span className={`${size === "md" ? "text-sm" : "text-[10px]"} tabular-nums text-stone-500 dark:text-stone-400`} aria-hidden="true">
        #{pair[1]}
      </span>
      <ChangeArrow figure="rank" pair={pair} since={since} size={size} />
    </span>
  );
}

/** "new" beside an item the earlier run did not have. */
export function NewBadge({ item }: { item: string }) {
  const { comparison, since } = useContext(ChangesContext);
  if (!comparison?.added.includes(item)) return null;
  return (
    <span className="ml-1 rounded-full bg-sky-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wider text-sky-900 dark:bg-sky-950 dark:text-sky-200" title={`Not in the run of ${since}`} data-testid="new-badge">
      new<span className="sr-only"> since {since}</span>
    </span>
  );
}

/** A figure's name, its value now and the change: a chip in the Changes tab and the item's key figures. */
export function ChangeChip({ figure, pair, since, now }: { figure: string; pair: Pair | undefined; since: string; now?: number }) {
  const def = figureDef(figure);
  const value = pair ? pair[1] : now;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-2 py-0.5 text-xs dark:border-stone-700 dark:bg-stone-900" data-figure={figure}>
      <span className="text-stone-500 dark:text-stone-400">{def.label}</span>
      {value !== undefined ? <span className="font-semibold tabular-nums text-stone-800 dark:text-stone-100">{formatFigure(def, value)}</span> : null}
      <ChangeArrow figure={figure} pair={pair} since={since} />
    </span>
  );
}
