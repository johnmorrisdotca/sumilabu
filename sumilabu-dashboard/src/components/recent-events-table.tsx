"use client";

import { useEffect, useState } from "react";

import { formatDateTimeAtOffset } from "@/lib/timezone";

type RecentEventRow = {
  id: string;
  receivedAt: string;
  projectKey: string;
  deviceId: string;
  event: string;
  gapSeconds: number | null;
  mode: string | null;
  memFree: number | null;
  sync: string | null;
};

type SortKey = "receivedAt" | "projectKey" | "deviceId" | "event" | "gapSeconds" | "mode" | "memFree" | "sync";
type SortDirection = "asc" | "desc";

type RecentEventsTableProps = {
  events: RecentEventRow[];
  timezoneOffsetHours: number;
};

const PAGE_SIZE_OPTIONS = [10, 20, 25, 35, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_SORT_KEY: SortKey = "receivedAt";
const DEFAULT_SORT_DIRECTION: SortDirection = "desc";
const PAGE_SIZE_STORAGE_KEY = "sumilabu.recentEvents.pageSize";
const SORT_STORAGE_KEY = "sumilabu.recentEvents.sort";

function fmtDuration(totalSeconds?: number | null): string {
  if (totalSeconds === null || totalSeconds === undefined) {
    return "-";
  }

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0 && seconds > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${minutes}m`;
}

function compareNullableNumber(left: number | null, right: number | null): number {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return left - right;
}

function compareNullableString(left: string | null, right: string | null): number {
  const normalizedLeft = left || "";
  const normalizedRight = right || "";
  return normalizedLeft.localeCompare(normalizedRight);
}

function compareRows(left: RecentEventRow, right: RecentEventRow, sortKey: SortKey): number {
  if (sortKey === "receivedAt") {
    return new Date(left.receivedAt).getTime() - new Date(right.receivedAt).getTime();
  }
  if (sortKey === "gapSeconds") {
    return compareNullableNumber(left.gapSeconds, right.gapSeconds);
  }
  if (sortKey === "memFree") {
    return compareNullableNumber(left.memFree, right.memFree);
  }
  if (sortKey === "mode") {
    return compareNullableString(left.mode, right.mode);
  }
  if (sortKey === "sync") {
    return compareNullableString(left.sync, right.sync);
  }
  return left[sortKey].localeCompare(right[sortKey]);
}

function sortIndicator(active: boolean, direction: SortDirection): string {
  if (!active) {
    return "<>";
  }
  return direction === "asc" ? "^" : "v";
}

export function RecentEventsTable({ events, timezoneOffsetHours }: RecentEventsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_SORT_KEY;
    }

    try {
      const storedSort = window.localStorage.getItem(SORT_STORAGE_KEY);
      if (!storedSort) {
        return DEFAULT_SORT_KEY;
      }

      const parsedSort = JSON.parse(storedSort) as { sortKey?: SortKey };
      return parsedSort.sortKey || DEFAULT_SORT_KEY;
    } catch {
      return DEFAULT_SORT_KEY;
    }
  });
  const [sortDirection, setSortDirection] = useState<SortDirection>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_SORT_DIRECTION;
    }

    try {
      const storedSort = window.localStorage.getItem(SORT_STORAGE_KEY);
      if (!storedSort) {
        return DEFAULT_SORT_DIRECTION;
      }

      const parsedSort = JSON.parse(storedSort) as { sortDirection?: SortDirection };
      return parsedSort.sortDirection === "asc" || parsedSort.sortDirection === "desc"
        ? parsedSort.sortDirection
        : DEFAULT_SORT_DIRECTION;
    } catch {
      return DEFAULT_SORT_DIRECTION;
    }
  });
  const [pageSize, setPageSize] = useState<number>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_PAGE_SIZE;
    }

    try {
      const storedPageSize = window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY);
      const parsedPageSize = Number(storedPageSize);
      if (PAGE_SIZE_OPTIONS.includes(parsedPageSize as (typeof PAGE_SIZE_OPTIONS)[number])) {
        return parsedPageSize;
      }
    } catch {
      // Ignore local preference failures and keep defaults.
    }

    return DEFAULT_PAGE_SIZE;
  });
  const [page, setPage] = useState(1);

  useEffect(() => {
    try {
      window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(pageSize));
      window.localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify({ sortKey, sortDirection }));
    } catch {
      // Ignore persistence failures.
    }
  }, [pageSize, sortDirection, sortKey]);

  const sortedEvents = [...events].sort((left, right) => {
    const result = compareRows(left, right, sortKey);
    return sortDirection === "asc" ? result : -result;
  });

  const pageCount = Math.max(1, Math.ceil(sortedEvents.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(sortedEvents.length, startIndex + pageSize);
  const visibleEvents = sortedEvents.slice(startIndex, endIndex);

  function handleSort(nextSortKey: SortKey) {
    setPage(1);
    if (nextSortKey === sortKey) {
      setSortDirection((currentDirection) => (currentDirection === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextSortKey);
    setSortDirection(nextSortKey === "receivedAt" ? "desc" : "asc");
  }

  function handlePageSizeChange(nextPageSize: number) {
    setPageSize(nextPageSize);
    setPage(1);
  }

  const pageWindowStart = Math.max(1, safePage - 2);
  const pageWindowEnd = Math.min(pageCount, pageWindowStart + 4);
  const pageButtons = [];

  for (let index = Math.max(1, pageWindowEnd - 4); index <= pageWindowEnd; index += 1) {
    pageButtons.push(index);
  }

  return (
    <section className="rounded-[28px] border border-stone-300/80 bg-white/90 p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Recent Events</h2>
          <p className="text-sm text-stone-600">
            Showing {sortedEvents.length === 0 ? 0 : startIndex + 1}-{endIndex} of {sortedEvents.length} loaded rows.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <span>Page size</span>
            <select
              className="rounded-full border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 outline-none transition focus:border-stone-500"
              value={pageSize}
              onChange={(event) => handlePageSizeChange(Number(event.target.value))}
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2 text-sm text-stone-600">
            <button
              type="button"
              className="rounded-full border border-stone-300 px-3 py-2 transition hover:border-stone-500 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => setPage(1)}
              disabled={safePage <= 1}
            >
              First
            </button>
            <button
              type="button"
              className="rounded-full border border-stone-300 px-3 py-2 transition hover:border-stone-500 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => setPage(Math.max(1, safePage - 1))}
              disabled={safePage <= 1}
            >
              Prev
            </button>
            <div className="hidden items-center gap-1 sm:flex">
              {pageButtons.map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  className={`min-w-10 rounded-full border px-3 py-2 transition ${pageNumber === safePage ? "border-stone-900 bg-stone-900 text-stone-50" : "border-stone-300 hover:border-stone-500 hover:bg-white"}`}
                  onClick={() => setPage(pageNumber)}
                >
                  {pageNumber}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="rounded-full border border-stone-300 px-3 py-2 transition hover:border-stone-500 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => setPage(Math.min(pageCount, safePage + 1))}
              disabled={safePage >= pageCount}
            >
              Next
            </button>
            <button
              type="button"
              className="rounded-full border border-stone-300 px-3 py-2 transition hover:border-stone-500 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => setPage(pageCount)}
              disabled={safePage >= pageCount}
            >
              Last
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              {[
                ["Time", "receivedAt"],
                ["Project", "projectKey"],
                ["Device", "deviceId"],
                ["Event", "event"],
                ["Gap", "gapSeconds"],
                ["Mode", "mode"],
                ["MemFree", "memFree"],
                ["Sync", "sync"],
              ].map(([label, key]) => {
                const typedKey = key as SortKey;
                const active = sortKey === typedKey;
                return (
                  <th key={key} className="p-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 font-medium transition hover:text-stone-800"
                      onClick={() => handleSort(typedKey)}
                    >
                      <span>{label}</span>
                      <span className={`font-mono text-[11px] ${active ? "text-stone-800" : "text-stone-400"}`}>
                        {sortIndicator(active, sortDirection)}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleEvents.length > 0 ? visibleEvents.map((eventRow) => (
              <tr key={eventRow.id} className="border-b border-neutral-100">
                <td className="p-2">{formatDateTimeAtOffset(eventRow.receivedAt, timezoneOffsetHours)}</td>
                <td className="p-2 font-mono">{eventRow.projectKey}</td>
                <td className="p-2 font-mono">{eventRow.deviceId}</td>
                <td className="p-2">{eventRow.event}</td>
                <td className="p-2">{fmtDuration(eventRow.gapSeconds)}</td>
                <td className="p-2">{eventRow.mode || "-"}</td>
                <td className="p-2">{eventRow.memFree ?? "-"}</td>
                <td className="p-2">{eventRow.sync || "-"}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={8} className="p-6 text-sm text-stone-500">
                  No events found for the current project.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-2 text-sm text-stone-600 sm:flex-row sm:items-center sm:justify-between">
        <div>
          Page {safePage} of {pageCount}
        </div>
        <div>
          Sort: <span className="font-mono text-stone-800">{sortKey}</span> {sortDirection}
        </div>
      </div>
    </section>
  );
}
