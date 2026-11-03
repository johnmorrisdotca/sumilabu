/*
 * Each family's colour and icon on the map and in the tables, light and dark.
 * Literal class strings, so Tailwind keeps them. A family the collector adds
 * later gets the plain stone style until it is given one here.
 */
export type FamilyStyle = { box: string; pill: string; text: string; dot: string; icon: string; iconBg: string };

export const FAMILY_STYLE: Record<string, FamilyStyle> = {
  "3d-views": {
    box: "fill-orange-50 stroke-orange-400 dark:fill-orange-950 dark:stroke-orange-700",
    pill: "fill-orange-100 stroke-orange-400 dark:fill-orange-900/70 dark:stroke-orange-600",
    text: "fill-orange-950 dark:fill-orange-50",
    dot: "bg-orange-500",
    icon: "stroke-orange-600 dark:stroke-orange-300",
    iconBg: "fill-orange-100 stroke-orange-400 dark:fill-orange-900 dark:stroke-orange-600",
  },
  "maps-addresses": {
    box: "fill-emerald-50 stroke-emerald-500 dark:fill-emerald-950 dark:stroke-emerald-700",
    pill: "fill-emerald-100 stroke-emerald-500 dark:fill-emerald-900/70 dark:stroke-emerald-600",
    text: "fill-emerald-950 dark:fill-emerald-50",
    dot: "bg-emerald-500",
    icon: "stroke-emerald-700 dark:stroke-emerald-300",
    iconBg: "fill-emerald-100 stroke-emerald-500 dark:fill-emerald-900 dark:stroke-emerald-600",
  },
  "sports-flags": {
    box: "fill-slate-100 stroke-slate-600 dark:fill-slate-900 dark:stroke-slate-500",
    pill: "fill-slate-200 stroke-slate-500 dark:fill-slate-800 dark:stroke-slate-500",
    text: "fill-slate-900 dark:fill-slate-50",
    dot: "bg-slate-700 dark:bg-slate-400",
    icon: "stroke-slate-700 dark:stroke-slate-200",
    iconBg: "fill-slate-200 stroke-slate-500 dark:fill-slate-800 dark:stroke-slate-500",
  },
  "games-words": {
    box: "fill-pink-50 stroke-pink-500 dark:fill-pink-950 dark:stroke-pink-700",
    pill: "fill-pink-100 stroke-pink-500 dark:fill-pink-900/70 dark:stroke-pink-600",
    text: "fill-pink-950 dark:fill-pink-50",
    dot: "bg-pink-500",
    icon: "stroke-pink-700 dark:stroke-pink-300",
    iconBg: "fill-pink-100 stroke-pink-500 dark:fill-pink-900 dark:stroke-pink-600",
  },
};

export const PLAIN_STYLE: FamilyStyle = {
  box: "fill-stone-50 stroke-stone-400 dark:fill-stone-900 dark:stroke-stone-600",
  pill: "fill-stone-100 stroke-stone-400 dark:fill-stone-800 dark:stroke-stone-600",
  text: "fill-stone-900 dark:fill-stone-50",
  dot: "bg-stone-400",
  icon: "stroke-stone-600 dark:stroke-stone-300",
  iconBg: "fill-stone-100 stroke-stone-400 dark:fill-stone-800 dark:stroke-stone-600",
};

export const styleOf = (group: string | null | undefined): FamilyStyle => (group && FAMILY_STYLE[group]) || PLAIN_STYLE;

/** A 24-unit outline per family: a cube, a pin, a globe, a die, a box. */
export const FAMILY_ICON: Record<string, string> = {
  "3d-views": "M12 2.5 20.5 7v10L12 21.5 3.5 17V7zM3.5 7 12 11.5 20.5 7M12 11.5v10",
  "maps-addresses": "M12 21.5s-7-6.3-7-11.5a7 7 0 0 1 14 0c0 5.2-7 11.5-7 11.5zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  "sports-flags": "M12 21.5a9.5 9.5 0 1 0 0-19 9.5 9.5 0 0 0 0 19zM2.5 12h19M12 2.5c2.6 2.6 4 6 4 9.5s-1.4 6.9-4 9.5c-2.6-2.6-4-6-4-9.5s1.4-6.9 4-9.5z",
  "games-words": "M5 3.5h14a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01",
};
export const PLAIN_ICON = "M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5zM3.5 7.5 12 12l8.5-4.5M12 12v9";
