import { revalidateTag, unstable_cache } from "next/cache";

import { latestEventByDevice, type LatestDeviceEvent } from "@/lib/device-latest-event";
import { prisma } from "@/lib/prisma";

/*
 * What the dashboard reads, answered from Next's data cache.
 *
 * On 2026-10-07 Neon's monitor showed the database waking every 13 to 20
 * minutes with no row written, and Vercel's request log named the cause: a
 * GET of `/` on sumilabu.com and api.sumilabu.com about every twenty minutes
 * (a crawler or a monitor, not a person and not a device). `/` is
 * `force-dynamic`, so each one was six queries, each one woke Neon for the
 * five minutes it waits before it sleeps again, and the project had been awake
 * for most of the month on the plan that bills by awake time.
 *
 * So the page's reads are cached under one tag. A telemetry write clears the
 * tag (`forgetDashboardData`), which means a page opened after anything
 * arrived shows it, and a page opened when nothing arrived is answered without
 * touching Postgres at all. The day-long revalidate only bounds how stale a
 * row edited outside the ingest routes (SQL, Prisma Studio) can be. Dates
 * cross the cache as text and are turned back into Dates here.
 */

export const DASHBOARD_DATA_TAG = "dashboard-data";
const DASHBOARD_CACHE_SECONDS = 24 * 60 * 60;

/* Only the columns the page draws. `raw`, and the app events' JSON columns,
   used to be read for every row loaded and were never shown. */
export const RECENT_EVENT_SELECT = {
  id: true,
  projectKey: true,
  deviceId: true,
  event: true,
  mode: true,
  memFree: true,
  sync: true,
  receivedAt: true,
} as const;

export const APP_EVENT_SELECT = {
  id: true,
  projectKey: true,
  sourceType: true,
  appId: true,
  environment: true,
  host: true,
  service: true,
  event: true,
  status: true,
  severity: true,
  message: true,
  durationMs: true,
  metricName: true,
  metricValue: true,
  metricUnit: true,
  receivedAt: true,
} as const;

export type ProjectLists = { deviceProjects: string[]; appSourceProjects: string[] };

type Reviveable = Record<string, unknown>;

/** JSON turns a Date into text; put the named fields back. Null stays null. */
export function reviveDates<T extends Reviveable>(row: T, keys: readonly string[]): T {
  const out: Reviveable = { ...row };
  for (const key of keys) {
    const value = out[key];
    if (typeof value === "string") out[key] = new Date(value);
  }
  return out as T;
}

/** Every project that has a device or a source: the two small tables name every project the event tables could. */
export async function readProjectLists(): Promise<ProjectLists> {
  const [devices, sources] = await Promise.all([
    prisma.device.findMany({ select: { projectKey: true }, distinct: ["projectKey"], orderBy: { projectKey: "asc" } }),
    prisma.appTelemetrySource.findMany({ select: { projectKey: true }, distinct: ["projectKey"], orderBy: { projectKey: "asc" } }),
  ]);
  return { deviceProjects: devices.map((d) => d.projectKey), appSourceProjects: sources.map((s) => s.projectKey) };
}

async function readProjectData(matchKeys: string[] | null) {
  const projectFilter = matchKeys ? { projectKey: { in: matchKeys } } : {};
  const [deviceRows, projectEvents, appSources, appEvents] = await Promise.all([
    prisma.device.findMany({ where: projectFilter, orderBy: { lastSeenAt: "desc" } }),
    prisma.deviceEvent.findMany({ where: projectFilter, orderBy: { receivedAt: "desc" }, take: 5000, select: RECENT_EVENT_SELECT }),
    prisma.appTelemetrySource.findMany({ where: projectFilter, orderBy: { lastSeenAt: "desc" }, take: 24 }),
    prisma.appTelemetryEvent.findMany({ where: projectFilter, orderBy: { receivedAt: "desc" }, take: 24, select: APP_EVENT_SELECT }),
  ]);
  const latest = await latestEventByDevice(deviceRows.map((device) => device.id));
  return { deviceRows, projectEvents, appSources, appEvents, latestEvents: [...latest.entries()] as [string, LatestDeviceEvent][] };
}

type ProjectData = Awaited<ReturnType<typeof readProjectData>>;

export const EMPTY_PROJECT_DATA: ProjectData = { deviceRows: [], projectEvents: [], appSources: [], appEvents: [], latestEvents: [] };

export async function getProjectLists(): Promise<ProjectLists> {
  return unstable_cache(readProjectLists, ["dashboard-project-lists"], { tags: [DASHBOARD_DATA_TAG], revalidate: DASHBOARD_CACHE_SECONDS })();
}

/** `matchKeys` null is every project. */
export async function getProjectData(matchKeys: string[] | null): Promise<ProjectData> {
  const cached = await unstable_cache(() => readProjectData(matchKeys), ["dashboard-project-data", matchKeys ? matchKeys.join(",") : "*"], {
    tags: [DASHBOARD_DATA_TAG],
    revalidate: DASHBOARD_CACHE_SECONDS,
  })();
  return {
    deviceRows: cached.deviceRows.map((row) => reviveDates(row, ["lastSeenAt", "createdAt", "updatedAt"])),
    projectEvents: cached.projectEvents.map((row) => reviveDates(row, ["receivedAt"])),
    appSources: cached.appSources.map((row) => reviveDates(row, ["lastSeenAt", "createdAt", "updatedAt"])),
    appEvents: cached.appEvents.map((row) => reviveDates(row, ["receivedAt"])),
    latestEvents: cached.latestEvents,
  };
}

/** Called after a telemetry write. `expire: 0` so the next page view sees it, not one stale answer first. */
export function forgetDashboardData(): void {
  revalidateTag(DASHBOARD_DATA_TAG, { expire: 0 });
}
