import type { ScorecardItem } from "@/lib/scorecard/contract";
import { defaultDir, daysSinceUpdate, formatCount, formatDays, itemVersion, overallValue, type GradeColumn, type SortDir, type SortKey } from "@/lib/scorecard/view";

import { openOfKind } from "@/lib/scorecard/tickets";

import { GradeCell, PrivateBadge } from "./grade-cell";
import { HeartButton } from "./heart-button";
import { RadarChart } from "./radar-chart";
import { Thumb } from "./thumb";

type Props = {
  items: ScorecardItem[];
  columns: GradeColumn[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey, dir: SortDir) => void;
  onOpen: (id: string) => void;
  favourites: ReadonlySet<string>;
  onToggleFavourite: (id: string, name: string) => void;
};

/** Open bugs (red) and open tickets as two small counts by the name; nothing when no board was read. */
export function TicketBadges({ item }: { item: ScorecardItem }) {
  const b = item.tickets;
  if (!b || b.open === 0) return null;
  const bugs = openOfKind(b, "bug");
  return (
    <span className="ml-1 inline-flex gap-1 align-middle" data-testid="ticket-badges">
      {bugs > 0 ? <span title={`${bugs} open bug${bugs === 1 ? "" : "s"}`} className="rounded-full bg-red-600 px-1.5 text-[10px] font-semibold leading-4 text-white">{bugs} bug{bugs === 1 ? "" : "s"}</span> : null}
      <span title={`${b.open} open ticket${b.open === 1 ? "" : "s"}`} className="rounded-full bg-stone-200 px-1.5 text-[10px] font-semibold leading-4 text-stone-700 dark:bg-stone-700 dark:text-stone-200">{b.open} open</span>
    </span>
  );
}

/** "@scope/pkg" reads as "pkg" in a row; the full name is the tooltip and the detail's title. */
function shortName(name: string): string {
  return name.startsWith("@") ? name.slice(name.indexOf("/") + 1) : name;
}

const KIND_WORD = { package: "package", site: "site", app: "app" } as const;

function staleClass(days: number | null): string {
  if (days === null) return "text-stone-400";
  if (days >= 45) return "font-semibold text-red-700 dark:text-red-400";
  if (days >= 21) return "font-semibold text-amber-700 dark:text-amber-400";
  return "text-stone-700 dark:text-stone-200";
}

export function ScorecardTable({ items, columns, sortKey, sortDir, onSort, onOpen, favourites, onToggleFavourite }: Props) {
  const header = (key: SortKey, label: string, title?: string, align: "left" | "center" = "left", pinned = false) => {
    const active = sortKey === key;
    return (
      <th
        key={key}
        scope="col"
        aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
        className={`px-1 py-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-stone-500 dark:text-stone-400 ${align === "center" ? "text-center" : "text-left"} ${pinned ? "sticky right-0 z-10 border-l border-stone-300/80 dark:border-stone-700 bg-stone-100" : ""}`}
      >
        <button
          type="button"
          title={title ?? `Sort by ${label}`}
          onClick={() => onSort(key, active ? (sortDir === "asc" ? "desc" : "asc") : defaultDir(key))}
          className={`inline-flex items-center gap-0.5 rounded px-1 py-1 uppercase hover:bg-stone-200/70 dark:hover:bg-stone-700 ${active ? "text-stone-900" : ""}`}
        >
          {label}
          <span aria-hidden className="w-3 text-[10px]">{active ? (sortDir === "asc" ? "▲" : "▼") : ""}</span>
        </button>
      </th>
    );
  };

  if (items.length === 0) {
    return <p className="hidden rounded-2xl border border-stone-300/80 dark:border-stone-700 bg-white/80 dark:bg-stone-900/80 p-6 text-center text-sm text-stone-600 dark:text-stone-300 md:block">Nothing matches these filters.</p>;
  }

  return (
    <div className="hidden overflow-x-auto rounded-2xl border border-stone-300/80 dark:border-stone-700 bg-white/90 dark:bg-stone-900/90 shadow-sm md:block print:block print:overflow-visible print:shadow-none" data-testid="scorecard-table">
      <table className="w-full min-w-[1000px] border-collapse text-sm print:min-w-0 print:text-[9px]">
        <thead className="border-b border-stone-300/80 dark:border-stone-700 bg-stone-100/90 dark:bg-stone-800">
          <tr>
            <th scope="col" aria-sort={sortKey === "name" ? (sortDir === "asc" ? "ascending" : "descending") : "none"} className="sticky left-0 z-10 bg-stone-100 dark:bg-stone-800 px-1 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-stone-500 dark:text-stone-400">
              <button
                type="button"
                onClick={() => onSort("name", sortKey === "name" && sortDir === "asc" ? "desc" : "asc")}
                className="inline-flex items-center gap-1 rounded px-1 py-1 uppercase hover:bg-stone-200/70 dark:hover:bg-stone-700"
              >
                Name <span aria-hidden className="w-3 text-[10px]">{sortKey === "name" ? (sortDir === "asc" ? "▲" : "▼") : ""}</span>
              </button>
            </th>
            {header("kind", "Kind")}
            {header("owner", "Owner")}
            {header("version", "Version")}
            {header("days", "Updated", "Days since the last commit or release")}
            {header("downloads", "Dl/wk", "npm downloads in the last week (includes the owner's own installs)")}
            {header("stars", "Stars")}
            {columns.map((c) => header(`grade:${c.id}`, c.label, `Sort by ${c.long}`, "center", c.id === "overall"))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const days = daysSinceUpdate(item);
            return (
              <tr key={item.id} className="border-b border-stone-200/80 dark:border-stone-700 last:border-0 hover:bg-amber-50/60 dark:hover:bg-stone-800" data-testid="scorecard-row" data-item={item.id}>
                <th scope="row" className="sticky left-0 z-10 bg-white px-1 py-1 text-left font-medium dark:bg-stone-900">
                  <span className="flex items-center gap-1.5">
                    <HeartButton on={favourites.has(item.id)} name={item.name} onToggle={() => onToggleFavourite(item.id, item.name)} />
                    <Thumb item={item} size="row" />
                    <span className="min-w-0">
                      <button type="button" onClick={() => onOpen(item.id)} className="max-w-[12rem] truncate rounded px-1 py-1 text-left text-stone-900 underline decoration-stone-300 underline-offset-2 hover:decoration-stone-700 dark:text-stone-100 dark:decoration-stone-600" title={`Open ${item.name}`}>
                        {shortName(item.name)}
                      </button>
                      {item.private ? <PrivateBadge /> : null}
                      {item.flags.length > 0 ? <span className="ml-1 text-xs text-amber-700 dark:text-amber-400" title={item.flags.join(", ")}>⚑{item.flags.length}</span> : null}
                      <TicketBadges item={item} />
                    </span>
                  </span>
                </th>
                <td className="px-1.5 py-1.5 text-stone-600 dark:text-stone-300">{KIND_WORD[item.kind]}</td>
                <td className="px-1.5 py-1.5 text-stone-600 dark:text-stone-300">{item.owner}</td>
                <td className="px-1.5 py-1.5 font-mono text-xs text-stone-700 dark:text-stone-200">{itemVersion(item) ?? "–"}</td>
                <td className={`px-1.5 py-1.5 tabular-nums ${staleClass(days)}`}>{formatDays(days)}</td>
                <td className="px-1.5 py-1.5 tabular-nums text-stone-700 dark:text-stone-200">{formatCount(item.popularity.npmDownloadsWeek)}</td>
                <td className="px-1.5 py-1.5 tabular-nums text-stone-700 dark:text-stone-200">{formatCount(item.popularity.stars)}</td>
                {columns.map((c) => (
                  <td key={c.id} className={`px-0.5 py-1.5 text-center ${c.id === "overall" ? "sticky right-0 z-10 border-l border-stone-200 bg-white dark:bg-stone-900 dark:border-stone-700 dark:bg-stone-900" : ""}`} data-grade={c.id}>
                    {c.id === "overall" ? (
                      <span className="inline-flex items-center gap-1">
                        <RadarChart item={item} columns={columns} overall={overallValue(item)} mini />
                        <GradeCell value={overallValue(item)} label={c.long} />
                      </span>
                    ) : (
                      <GradeCell value={item.grades[c.id] ?? null} label={c.long} />
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
