import Image from "next/image";
import Link from "next/link";

import { AutoRefreshControl } from "@/components/auto-refresh-control";
import { HeartbeatRadar } from "@/components/heartbeat-radar";
import { RecentEventsTable } from "@/components/recent-events-table";
import { WidgetCanvas } from "@/components/widget-canvas";
import { prisma } from "@/lib/prisma";
import { formatDateTimeAtOffset, formatHourMinuteAtOffset } from "@/lib/timezone";
import { LiveClock } from "@/components/live-clock";

export const dynamic = "force-dynamic";

const STALE_AFTER_SECONDS = Number(process.env.STALE_AFTER_SECONDS || "900");
const EXPECTED_HEARTBEAT_SECONDS = Number(process.env.EXPECTED_HEARTBEAT_SECONDS || "300");
const DASHBOARD_UTC_OFFSET_HOURS = Number(process.env.DASHBOARD_UTC_OFFSET_HOURS || "-8");
const MAX_HEARTBEAT_SLOTS = 48;
const CHART_WIDTH = 720;
const CHART_HEIGHT = 240;
const CHART_PADDING_X = 28;
const CHART_PADDING_Y = 20;
const KNOWN_PRODUCT_KEYS = ["sumilabu-clock", "onibako"];
const PROJECT_KEY_ALIASES: Record<string, string> = {
  inkyframe: "sumilabu-clock",
  "sumilabu clock": "sumilabu-clock",
  "sumilabu-clock": "sumilabu-clock",
  "sumilabu_clock": "sumilabu-clock",
};

type DeviceCard = {
  id: string;
  projectKey: string;
  deviceId: string;
  appVersion: string | null;
  lastMode: string | null;
  lastSeenAt: Date | null;
  events: Array<{
    event: string;
    memFree: number | null;
    ntpOk: boolean | null;
  }>;
};

type RecentEvent = {
  id: string;
  projectKey: string;
  deviceId: string;
  event: string;
  mode: string | null;
  memFree: number | null;
  sync: string | null;
  receivedAt: Date;
};

type AppTelemetrySourceCard = {
  id: string;
  projectKey: string;
  sourceType: string;
  appId: string;
  displayName: string | null;
  environment: string;
  host: string | null;
  service: string | null;
  lastEvent: string | null;
  lastStatus: string | null;
  lastSeverity: string | null;
  lastMessage: string | null;
  lastSeenAt: Date | null;
};

type AppTelemetryEventRow = {
  id: string;
  projectKey: string;
  sourceType: string;
  appId: string;
  environment: string;
  host: string | null;
  service: string | null;
  event: string;
  status: string | null;
  severity: string | null;
  message: string | null;
  durationMs: number | null;
  metricName: string | null;
  metricValue: number | null;
  metricUnit: string | null;
  receivedAt: Date;
};

type ChartPoint = {
  x: number;
  y: number;
  label: string;
  memFree: number;
  event: string;
};

type HeartbeatSlot = {
  count: number;
  label: string;
  hasPing: boolean;
  fromTime: string;
  toTime: string;
  events: string[];
  memFreeMin: number | null;
  memFreeMax: number | null;
};

type DeviceHealth = {
  projectKey: string;
  deviceId: string;
  status: "healthy" | "warning" | "offline";
  lastSeenAt: Date | null;
  lastPingAgeSeconds: number | null;
  maxGapSeconds: number | null;
  latestGapSeconds: number | null;
  missedHeartbeats: number;
  observedUptimeSeconds: number;
  activeStreakSeconds: number;
  timeline: HeartbeatSlot[];
};

function fmtTime(ts?: Date | null): string {
  if (!ts) {
    return "never";
  }
  return formatDateTimeAtOffset(ts, DASHBOARD_UTC_OFFSET_HOURS);
}

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

function fmtAge(ts?: Date | null): string {
  if (!ts) {
    return "never";
  }

  const ageSeconds = Math.max(0, Math.floor((Date.now() - ts.getTime()) / 1000));
  return `${fmtDuration(ageSeconds)} ago`;
}

function isOnline(ts?: Date | null): boolean {
  if (!ts) {
    return false;
  }
  return Date.now() - ts.getTime() <= STALE_AFTER_SECONDS * 1000;
}

function uniqSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function sanitizeProjectParam(value?: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length > 128) {
    return null;
  }

  if (!/^[a-zA-Z0-9._ -]+$/.test(trimmed)) {
    return null;
  }

  return canonicalProjectKey(trimmed);
}

function canonicalProjectKey(projectKey: string): string {
  return PROJECT_KEY_ALIASES[projectKey.trim().toLowerCase()] || projectKey.trim();
}

function configuredProjectKeys(): string[] {
  const raw = process.env.PROJECT_TOKENS_JSON;
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.keys(parsed || {})
      .map((key) => sanitizeProjectParam(key))
      .filter((key): key is string => Boolean(key));
  } catch {
    return [];
  }
}

function projectKeyMatches(projectKey: string): string[] {
  const canonical = canonicalProjectKey(projectKey);
  return uniqSorted([
    canonical,
    ...Object.entries(PROJECT_KEY_ALIASES)
      .filter(([, value]) => value === canonical)
      .map(([alias]) => alias),
  ]);
}

function buildMemChartPoints(events: RecentEvent[]): ChartPoint[] {
  const memEvents = events
    .filter((event) => typeof event.memFree === "number")
    .slice(0, 24)
    .reverse();

  if (memEvents.length === 0) {
    return [];
  }

  const minMem = Math.min(...memEvents.map((event) => event.memFree as number));
  const maxMem = Math.max(...memEvents.map((event) => event.memFree as number));
  const memRange = Math.max(maxMem - minMem, 1);
  const usableWidth = CHART_WIDTH - CHART_PADDING_X * 2;
  const usableHeight = CHART_HEIGHT - CHART_PADDING_Y * 2;

  return memEvents.map((event, index) => {
    const progress = memEvents.length === 1 ? 0.5 : index / (memEvents.length - 1);
    const memValue = event.memFree as number;

    return {
      x: CHART_PADDING_X + usableWidth * progress,
      y: CHART_HEIGHT - CHART_PADDING_Y - ((memValue - minMem) / memRange) * usableHeight,
      label: formatHourMinuteAtOffset(event.receivedAt, DASHBOARD_UTC_OFFSET_HOURS),
      memFree: memValue,
      event: event.event,
    };
  });
}

function chartPath(points: ChartPoint[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function eventBreakdown(events: RecentEvent[]): Array<{ label: string; value: number }> {
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.event, (counts.get(event.event) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value);
}

function buildHeartbeatTimeline(events: RecentEvent[], nowMs: number): HeartbeatSlot[] {
  if (events.length === 0) {
    return [];
  }

  const oldestMs = events.at(-1)!.receivedAt.getTime();
  const rangeMs = Math.max(nowMs - oldestMs, EXPECTED_HEARTBEAT_SECONDS * 1000);
  const idealSlots = Math.ceil(rangeMs / (EXPECTED_HEARTBEAT_SECONDS * 1000));
  const slotCount = Math.max(1, Math.min(idealSlots, MAX_HEARTBEAT_SLOTS));
  const slotSizeMs = rangeMs / slotCount;
  const windowStartMs = nowMs - slotCount * slotSizeMs;

  type SlotAccum = { count: number; events: string[]; memValues: number[] };
  const accums: SlotAccum[] = Array.from({ length: slotCount }, () => ({ count: 0, events: [], memValues: [] }));

  for (const event of events) {
    const eventMs = event.receivedAt.getTime();
    if (eventMs < windowStartMs || eventMs > nowMs) {
      continue;
    }

    const slotIndex = Math.min(
      slotCount - 1,
      Math.max(0, Math.floor((eventMs - windowStartMs) / slotSizeMs)),
    );

    accums[slotIndex].count += 1;
    accums[slotIndex].events.push(event.event);
    if (typeof event.memFree === "number") {
      accums[slotIndex].memValues.push(event.memFree);
    }
  }

  return accums.map((acc, index) => {
    const secondsAgo = Math.round((slotCount - 1 - index) * (slotSizeMs / 1000));
    const slotStartMs = windowStartMs + index * slotSizeMs;
    const slotEndMs = slotStartMs + slotSizeMs;

    return {
      count: acc.count,
      hasPing: acc.count > 0,
      label: secondsAgo === 0 ? "now" : `-${fmtDuration(secondsAgo)}`,
      fromTime: formatHourMinuteAtOffset(new Date(slotStartMs), DASHBOARD_UTC_OFFSET_HOURS),
      toTime: formatHourMinuteAtOffset(new Date(slotEndMs), DASHBOARD_UTC_OFFSET_HOURS),
      events: acc.events,
      memFreeMin: acc.memValues.length > 0 ? Math.min(...acc.memValues) : null,
      memFreeMax: acc.memValues.length > 0 ? Math.max(...acc.memValues) : null,
    };
  });
}

function buildDeviceHealth(device: DeviceCard, events: RecentEvent[], nowMs: number): DeviceHealth {
  let maxGapSeconds: number | null = null;
  let latestGapSeconds: number | null = null;

  for (let index = 0; index < events.length - 1; index += 1) {
    const gapSeconds = Math.max(
      0,
      Math.floor((events[index].receivedAt.getTime() - events[index + 1].receivedAt.getTime()) / 1000),
    );

    if (maxGapSeconds === null || gapSeconds > maxGapSeconds) {
      maxGapSeconds = gapSeconds;
    }

    if (index === 0) {
      latestGapSeconds = gapSeconds;
    }
  }

  const lastPingAgeSeconds = device.lastSeenAt
    ? Math.max(0, Math.floor((nowMs - device.lastSeenAt.getTime()) / 1000))
    : null;
  const timeline = buildHeartbeatTimeline(events, nowMs);
  const missedHeartbeats = lastPingAgeSeconds
    ? Math.max(0, Math.floor(lastPingAgeSeconds / EXPECTED_HEARTBEAT_SECONDS) - 1)
    : timeline.length || MAX_HEARTBEAT_SLOTS;

  // Observed uptime: span from oldest to newest event
  let observedUptimeSeconds = 0;
  if (events.length >= 2) {
    const newest = events[0].receivedAt.getTime();
    const oldest = events.at(-1)!.receivedAt.getTime();
    observedUptimeSeconds = Math.max(0, Math.floor((newest - oldest) / 1000));
  }

  // Active streak: consecutive filled slots from the end of the timeline
  let streakSlots = 0;
  for (let i = timeline.length - 1; i >= 0; i -= 1) {
    if (!timeline[i].hasPing) break;
    streakSlots += 1;
  }
  const slotDurationSeconds = timeline.length > 0
    ? Math.round(observedUptimeSeconds / timeline.length) || EXPECTED_HEARTBEAT_SECONDS
    : EXPECTED_HEARTBEAT_SECONDS;
  const activeStreakSeconds = streakSlots * slotDurationSeconds;

  let status: DeviceHealth["status"] = "healthy";

  if (!device.lastSeenAt || !isOnline(device.lastSeenAt)) {
    status = "offline";
  } else if (
    (lastPingAgeSeconds !== null && lastPingAgeSeconds > EXPECTED_HEARTBEAT_SECONDS * 1.5)
    || (latestGapSeconds !== null && latestGapSeconds > EXPECTED_HEARTBEAT_SECONDS * 2)
    || timeline.slice(-4).some((slot) => !slot.hasPing)
  ) {
    status = "warning";
  }

  return {
    projectKey: device.projectKey,
    deviceId: device.deviceId,
    status,
    lastSeenAt: device.lastSeenAt,
    lastPingAgeSeconds,
    maxGapSeconds,
    latestGapSeconds,
    missedHeartbeats,
    observedUptimeSeconds,
    activeStreakSeconds,
    timeline,
  };
}

function statusPillClasses(status: DeviceHealth["status"]): string {
  if (status === "offline") {
    return "bg-red-100 text-red-700";
  }

  if (status === "warning") {
    return "bg-amber-100 text-amber-800";
  }

  return "bg-emerald-100 text-emerald-700";
}

function statusLabel(status: DeviceHealth["status"]): string {
  if (status === "offline") {
    return "offline";
  }

  if (status === "warning") {
    return "gap risk";
  }

  return "healthy";
}

function productLabel(projectKey: string): string {
  if (canonicalProjectKey(projectKey) === "sumilabu-clock") {
    return "SumiLabu Clock";
  }

  if (projectKey === "onibako") {
    return "Onibako";
  }

  if (projectKey === "wazadb-api") {
    return "WazaDB API";
  }

  if (projectKey === "wazadb-web") {
    return "WazaDB Web";
  }

  return projectKey;
}

function appStatusPillClasses(status?: string | null, severity?: string | null): string {
  const value = (status || severity || "unknown").toLowerCase();

  if (["error", "failed", "fail", "critical", "fatal"].includes(value)) {
    return "bg-red-100 text-red-700";
  }

  if (["warn", "warning", "degraded"].includes(value)) {
    return "bg-amber-100 text-amber-800";
  }

  if (["ok", "healthy", "success", "info"].includes(value)) {
    return "bg-emerald-100 text-emerald-700";
  }

  return "bg-stone-100 text-stone-700";
}

function fmtMetric(event: AppTelemetryEventRow): string {
  if (event.metricName && event.metricValue !== null) {
    return `${event.metricName}: ${event.metricValue}${event.metricUnit ? ` ${event.metricUnit}` : ""}`;
  }

  if (event.durationMs !== null) {
    return `duration: ${fmtDuration(Math.round(event.durationMs / 1000))}`;
  }

  return "-";
}

type PageProps = {
  searchParams?: Promise<{ project?: string }>;
};

export default async function Home({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const selectedProject = sanitizeProjectParam(params.project);
  const localTimezoneLabel = `UTC${DASHBOARD_UTC_OFFSET_HOURS >= 0 ? "+" : ""}${DASHBOARD_UTC_OFFSET_HOURS}`;

  const [deviceProjects, eventProjects, appSourceProjects, appEventProjects] = await Promise.all([
    prisma.device.findMany({
      select: { projectKey: true },
      distinct: ["projectKey"],
      orderBy: { projectKey: "asc" },
    }),
    prisma.deviceEvent.findMany({
      select: { projectKey: true },
      distinct: ["projectKey"],
      orderBy: { projectKey: "asc" },
    }),
    prisma.appTelemetrySource.findMany({
      select: { projectKey: true },
      distinct: ["projectKey"],
      orderBy: { projectKey: "asc" },
    }),
    prisma.appTelemetryEvent.findMany({
      select: { projectKey: true },
      distinct: ["projectKey"],
      orderBy: { projectKey: "asc" },
    }),
  ]);

  const availableProjects = uniqSorted([
    canonicalProjectKey(process.env.DEFAULT_PROJECT_KEY || "default"),
    ...KNOWN_PRODUCT_KEYS,
    ...configuredProjectKeys(),
    ...(selectedProject ? [selectedProject] : []),
    ...deviceProjects.map((project) => canonicalProjectKey(project.projectKey)),
    ...eventProjects.map((project) => canonicalProjectKey(project.projectKey)),
    ...appSourceProjects.map((project) => canonicalProjectKey(project.projectKey)),
    ...appEventProjects.map((project) => canonicalProjectKey(project.projectKey)),
  ]);

  const projectFilter = selectedProject ? { projectKey: { in: projectKeyMatches(selectedProject) } } : {};

  const [devices, projectEvents, appSources, appEvents] = await Promise.all([
    prisma.device.findMany({
      where: projectFilter,
      orderBy: { lastSeenAt: "desc" },
      include: {
        events: {
          orderBy: { receivedAt: "desc" },
          take: 1,
        },
      },
    }),
    prisma.deviceEvent.findMany({
      where: projectFilter,
      orderBy: { receivedAt: "desc" },
      take: 5000,
    }),
    prisma.appTelemetrySource.findMany({
      where: projectFilter,
      orderBy: { lastSeenAt: "desc" },
      take: 24,
    }),
    prisma.appTelemetryEvent.findMany({
      where: projectFilter,
      orderBy: { receivedAt: "desc" },
      take: 80,
    }),
  ]);

  const recentEvents: RecentEvent[] = projectEvents.slice(0, 60);
  const recentAppEvents: AppTelemetryEventRow[] = appEvents.slice(0, 24);
  const appSourceCards: AppTelemetrySourceCard[] = appSources;
  const nowMs = new Date().getTime();
  const eventsByDevice = new Map<string, RecentEvent[]>();

  for (const event of projectEvents) {
    const list = eventsByDevice.get(event.deviceId) || [];
    list.push(event);
    eventsByDevice.set(event.deviceId, list);
  }

  const eventGapSeconds = new Map<string, number | null>();

  for (const events of eventsByDevice.values()) {
    for (let index = 0; index < events.length; index += 1) {
      const current = events[index];
      const previous = events[index + 1];
      const gapSeconds = previous
        ? Math.max(0, Math.floor((current.receivedAt.getTime() - previous.receivedAt.getTime()) / 1000))
        : null;

      eventGapSeconds.set(current.id, gapSeconds);
    }
  }

  const recentEventsTableRows = projectEvents.slice(0, 240).map((event) => ({
    id: event.id,
    receivedAt: event.receivedAt.toISOString(),
    projectKey: event.projectKey,
    deviceId: event.deviceId,
    event: event.event,
    gapSeconds: eventGapSeconds.get(event.id) ?? null,
    mode: event.mode,
    memFree: event.memFree,
    sync: event.sync,
  }));

  const onlineDevices = devices.filter((device) => isOnline(device.lastSeenAt)).length;
  const deviceHealth = devices.map((device) => buildDeviceHealth(device, eventsByDevice.get(device.deviceId) || [], nowMs));
  const offlineDevices = deviceHealth.filter((device) => device.status === "offline").length;
  const warningDevices = deviceHealth.filter((device) => device.status === "warning").length;
  const longestSilenceSeconds = deviceHealth.length > 0
    ? Math.max(...deviceHealth.map((device) => device.lastPingAgeSeconds || 0))
    : 0;
  const longestObservedGapSeconds = deviceHealth.length > 0
    ? Math.max(...deviceHealth.map((device) => device.maxGapSeconds || 0))
    : 0;
  const chartPoints = buildMemChartPoints(recentEvents);
  const chartLine = chartPath(chartPoints);
  const chartMin = chartPoints.length ? Math.min(...chartPoints.map((point) => point.memFree)) : null;
  const chartMax = chartPoints.length ? Math.max(...chartPoints.map((point) => point.memFree)) : null;
  const latestEvent = recentEvents[0] || null;
  const breakdown = eventBreakdown(recentEvents);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5f0e8_0%,#ece6dc_52%,#e1d8cb_100%)] text-stone-900">
      <main className="mx-auto max-w-7xl p-6 md:p-8">
        <header className="mb-3 overflow-hidden rounded-[24px] border border-stone-300/80 bg-[radial-gradient(circle_at_top_left,#fff7ed_0%,#f5efe5_42%,#ebe1d3_100%)] p-3 md:p-4 shadow-[0_10px_30px_rgba(68,54,40,0.10)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-start gap-4 max-w-3xl">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-stone-300/80 bg-white/70 shadow-[0_8px_24px_rgba(68,54,40,0.12)] sm:h-20 sm:w-20">
                <Image
                  src="/sumilabu.png"
                  alt="SumiLabu fox logo"
                  fill
                  sizes="80px"
                  className="object-cover"
                  priority
                />
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">SumiLabu Fleet</p>
                <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Telemetry for live SumiLabu products</h1>
                <p className="mt-2 max-w-xl text-sm leading-5 text-stone-600 md:text-[15px]">
                  SumiLabu is the top-level monitoring hub for product telemetry. Choose a product partition such as SumiLabu Clock or Onibako to inspect firmware devices, app services, and recent ingest activity.
                </p>
              </div>
            </div>

            <div className="grid min-w-[270px] gap-1.5 rounded-2xl border border-stone-300/80 bg-white/75 p-2.5 backdrop-blur">
              <div className="rounded-xl border border-stone-300/70 bg-white/85 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Local time ({localTimezoneLabel})</p>
                <LiveClock utcOffsetHours={DASHBOARD_UTC_OFFSET_HOURS} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-stone-500">Product</span>
                <span className="font-mono text-xs text-stone-700">{selectedProject ? productLabel(selectedProject) : "all products"}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-stone-500">Devices online</span>
                <span className="text-lg font-semibold text-emerald-700">{onlineDevices}/{devices.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-stone-500">App sources</span>
                <span className="text-lg font-semibold text-[#2f6b5f]">{appSourceCards.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-stone-500">Latest ingest</span>
                <span className="font-mono text-xs text-stone-700">{fmtTime(latestEvent?.receivedAt || recentAppEvents[0]?.receivedAt)}</span>
              </div>
              <AutoRefreshControl defaultMs={60000} />
            </div>
          </div>

          <nav className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/"
              className={`rounded-full border px-4 py-2 text-sm transition ${!selectedProject ? "border-stone-900 bg-stone-900 text-stone-50" : "border-stone-300 bg-white/80 text-stone-700 hover:border-stone-500 hover:bg-white"}`}
            >
              All
            </Link>
            {availableProjects.map((projectKey) => {
              const active = projectKey === selectedProject;
              return (
                <a
                  key={projectKey}
                  href={`/?project=${encodeURIComponent(projectKey)}`}
                  className={`rounded-full border px-4 py-2 text-sm transition ${active ? "border-stone-900 bg-stone-900 text-stone-50" : "border-stone-300 bg-white/80 text-stone-700 hover:border-stone-500 hover:bg-white"}`}
                >
                  {productLabel(projectKey)}
                </a>
              );
            })}
          </nav>
        </header>

        <WidgetCanvas storageKey="sumilabu.dashboard.widgets.v4">
        <section data-widget-id="overview" data-widget-title="Overview" data-widget-cols="12" data-widget-rows="2" data-widget-body-class="grid gap-3 md:grid-cols-2 xl:grid-cols-4" className="rounded-[20px] border border-stone-300/70 bg-white/62 p-2 shadow-sm lg:col-span-12">
          <article className="rounded-[20px] border border-stone-300/80 bg-white/88 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Devices</p>
            <p className="mt-2 text-3xl font-semibold">{devices.length}</p>
            <p className="mt-1 text-sm text-stone-600">{selectedProject ? "Tracked under this project key." : "Across all projects."}</p>
          </article>
          <article className="rounded-[20px] border border-stone-300/80 bg-white/88 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Online Now</p>
            <p className="mt-2 text-3xl font-semibold text-emerald-700">{onlineDevices}</p>
            <p className="mt-1 text-sm text-stone-600">Seen within the last {STALE_AFTER_SECONDS}s.</p>
          </article>
          <article className="rounded-[20px] border border-stone-300/80 bg-white/88 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Recent Events</p>
            <p className="mt-2 text-3xl font-semibold">{recentEvents.length}</p>
            <p className="mt-1 text-sm text-stone-600">Most recent telemetry rows loaded in the dashboard.</p>
          </article>
          <article className="rounded-[20px] border border-stone-300/80 bg-white/88 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Top Event</p>
            <p className="mt-2 text-2xl font-semibold">{breakdown[0]?.label || "-"}</p>
            <p className="mt-1 text-sm text-stone-600">{breakdown[0]?.value || 0} events in the current sample window.</p>
          </article>
        </section>

        <section data-widget-id="health-radar" data-widget-title="Health & Radar" data-widget-cols="12" data-widget-rows="4" data-widget-body-class="grid gap-3 xl:grid-cols-[0.95fr_1.55fr]" className="rounded-[20px] border border-stone-300/70 bg-white/62 p-2 shadow-sm lg:col-span-12">
          <article className="rounded-[22px] border border-stone-300/80 bg-white/90 p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Gap Watch</h2>
                <p className="text-sm text-stone-600">The page judges device health against an expected ping cadence of {EXPECTED_HEARTBEAT_SECONDS}s.</p>
              </div>
              <span className="rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-stone-50">
                Live gap detection
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Offline devices</p>
                <p className="mt-2 text-3xl font-semibold text-red-700">{offlineDevices}</p>
                <p className="mt-1 text-sm text-stone-600">No ping within the stale window.</p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Gap risk</p>
                <p className="mt-2 text-3xl font-semibold text-amber-700">{warningDevices}</p>
                <p className="mt-1 text-sm text-stone-600">Devices that are alive but already showing heartbeat gaps.</p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Longest silence now</p>
                <p className="mt-2 text-3xl font-semibold">{fmtDuration(longestSilenceSeconds)}</p>
                <p className="mt-1 text-sm text-stone-600">Time since the least recently seen device last pinged.</p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Longest recent gap</p>
                <p className="mt-2 text-3xl font-semibold">{fmtDuration(longestObservedGapSeconds)}</p>
                <p className="mt-1 text-sm text-stone-600">Largest event-to-event hole in the recent sample window.</p>
              </div>
            </div>

            <div className="mt-4 space-y-2.5">
              {deviceHealth.length > 0 ? deviceHealth.map((device) => (
                <div key={device.deviceId} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm font-semibold text-stone-800">{device.projectKey}/{device.deviceId}</p>
                      <p className="mt-1 text-sm text-stone-600">Last ping {fmtAge(device.lastSeenAt)}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${statusPillClasses(device.status)}`}>
                      {statusLabel(device.status)}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-stone-600 sm:grid-cols-3">
                    <div>Current silence <span className="font-mono text-stone-800">{fmtDuration(device.lastPingAgeSeconds)}</span></div>
                    <div>Latest gap <span className="font-mono text-stone-800">{fmtDuration(device.latestGapSeconds)}</span></div>
                    <div>Missed beats <span className="font-mono text-stone-800">{device.missedHeartbeats}</span></div>
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-sm text-stone-500">
                  No devices have reported into this project yet.
                </div>
              )}
            </div>
          </article>

          <article className="rounded-[22px] border border-stone-300/80 bg-white/90 p-4 shadow-sm">
            <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Heartbeat Radar</h2>
                <p className="text-sm text-stone-600">Each block covers one expected heartbeat window. Missing blocks make device silence obvious at a glance.</p>
              </div>
              <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Oldest to newest</p>
            </div>

            <div className="space-y-3">
              {deviceHealth.length > 0 ? deviceHealth.map((device) => (
                <div key={device.deviceId} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm font-semibold text-stone-800">{device.deviceId}</p>
                      <p className="text-sm text-stone-600">{fmtAge(device.lastSeenAt)} • max recent gap {fmtDuration(device.maxGapSeconds)} • streak {fmtDuration(device.activeStreakSeconds)} • observed {fmtDuration(device.observedUptimeSeconds)}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${statusPillClasses(device.status)}`}>
                      {statusLabel(device.status)}
                    </span>
                  </div>

                  <HeartbeatRadar
                    deviceId={device.deviceId}
                    status={device.status}
                    timeline={device.timeline}
                  />
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-sm text-stone-500">
                  Heartbeat history will appear here once this project has incoming telemetry.
                </div>
              )}
            </div>
          </article>
        </section>

        <section data-widget-id="memory-ingest" data-widget-title="Memory & Ingest" data-widget-cols="12" data-widget-rows="3" data-widget-body-class="grid gap-3 xl:grid-cols-[1.7fr_1fr]" className="rounded-[20px] border border-stone-300/70 bg-white/62 p-2 shadow-sm lg:col-span-12">
          <article className="rounded-[22px] border border-stone-300/80 bg-white/90 p-4 shadow-sm">
            <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Recent free-memory trend</h2>
                <p className="text-sm text-stone-600">Last {chartPoints.length || 0} telemetry points with a reported <span className="font-mono">mem_free</span> value.</p>
              </div>
              <div className="text-sm text-stone-500">
                <span className="font-mono">min {chartMin ?? "-"}</span>
                <span className="mx-2">/</span>
                <span className="font-mono">max {chartMax ?? "-"}</span>
              </div>
            </div>

            {chartPoints.length > 0 ? (
              <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="w-full overflow-visible rounded-2xl bg-stone-950/[0.03] p-2">
                <line x1={CHART_PADDING_X} y1={CHART_HEIGHT - CHART_PADDING_Y} x2={CHART_WIDTH - CHART_PADDING_X} y2={CHART_HEIGHT - CHART_PADDING_Y} stroke="#b8a78f" strokeWidth="1" />
                <line x1={CHART_PADDING_X} y1={CHART_PADDING_Y} x2={CHART_PADDING_X} y2={CHART_HEIGHT - CHART_PADDING_Y} stroke="#b8a78f" strokeWidth="1" />
                <path d={chartLine} fill="none" stroke="#b33a3a" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
                {chartPoints.map((point) => (
                  <g key={`${point.label}-${point.memFree}-${point.x}`}>
                    <circle cx={point.x} cy={point.y} r="4.5" fill="#2f6b5f" />
                    <text x={point.x} y={CHART_HEIGHT - 6} textAnchor="middle" fontSize="11" fill="#6b6257">{point.label}</text>
                  </g>
                ))}
              </svg>
            ) : (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-sm text-stone-500">
                No memory telemetry yet for this project. Once devices start posting <span className="font-mono">mem_free</span>, the chart will populate automatically.
              </div>
            )}
          </article>

          <article className="rounded-[22px] border border-stone-300/80 bg-white/90 p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Ingest shape</h2>
            <p className="mt-1 text-sm text-stone-600">What the API is receiving{selectedProject ? <> for <span className="font-mono">{selectedProject}</span></> : null}.</p>
            <div className="mt-4 space-y-3">
              {breakdown.length > 0 ? breakdown.map((item) => (
                <div key={item.label}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-stone-700">{item.label}</span>
                    <span className="font-mono text-stone-500">{item.value}</span>
                  </div>
                  <div className="h-2 rounded-full bg-stone-200">
                    <div className="h-2 rounded-full bg-[#2f6b5f]" style={{ width: `${(item.value / recentEvents.length) * 100}%` }} />
                  </div>
                </div>
              )) : (
                <p className="text-sm text-stone-500">No events have been ingested for this project yet.</p>
              )}
            </div>
          </article>
        </section>

        <section data-widget-id="app-telemetry" data-widget-title="App Telemetry" data-widget-cols="12" data-widget-rows="3" data-widget-body-class="grid gap-3 xl:grid-cols-[1fr_1.4fr]" className="rounded-[20px] border border-stone-300/70 bg-white/62 p-2 shadow-sm lg:col-span-12">
          <article className="rounded-[22px] border border-stone-300/80 bg-white/90 p-4 shadow-sm">
            <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-lg font-semibold">App & server sources</h2>
                <p className="text-sm text-stone-600">Generic telemetry sources for product apps and servers{selectedProject ? <> under <span className="font-mono">{productLabel(selectedProject)}</span></> : null}.</p>
              </div>
              <span className="rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-stone-50">
                {appSourceCards.length} sources
              </span>
            </div>

            <div className="space-y-3">
              {appSourceCards.length > 0 ? appSourceCards.map((source) => (
                <div key={source.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm font-semibold text-stone-800">{source.projectKey}/{source.sourceType}/{source.appId}</p>
                      <p className="mt-1 text-sm text-stone-600">{source.displayName || productLabel(source.projectKey)} • {source.environment}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${appStatusPillClasses(source.lastStatus, source.lastSeverity)}`}>
                      {source.lastStatus || source.lastSeverity || "unknown"}
                    </span>
                  </div>
                  <dl className="mt-3 space-y-1 text-sm">
                    <div className="flex justify-between gap-3"><dt className="text-neutral-500">Service</dt><dd className="font-mono text-right text-stone-800">{source.service || "-"}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-neutral-500">Host</dt><dd className="font-mono text-right text-stone-800">{source.host || "-"}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-neutral-500">Last event</dt><dd className="text-right text-stone-800">{source.lastEvent || "-"}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-neutral-500">Last seen</dt><dd className="text-right text-stone-800">{fmtAge(source.lastSeenAt)}</dd></div>
                  </dl>
                  {source.lastMessage ? <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm text-stone-600">{source.lastMessage}</p> : null}
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-sm text-stone-500">
                  No app or server telemetry has reported for this product yet. Onibako deployments and service checks will appear here after posting to the generic ingest endpoint.
                </div>
              )}
            </div>
          </article>

          <article className="rounded-[22px] border border-stone-300/80 bg-white/90 p-4 shadow-sm">
            <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Recent app events</h2>
                <p className="text-sm text-stone-600">Latest generic app/server telemetry, separate from the hardware device heartbeat stream.</p>
              </div>
              <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Newest first</p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-stone-200">
              <div className="grid grid-cols-[1.1fr_0.8fr_0.7fr_1fr] gap-3 bg-stone-100 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                <span>Source</span>
                <span>Event</span>
                <span>Status</span>
                <span>Signal</span>
              </div>
              {recentAppEvents.length > 0 ? recentAppEvents.map((event) => (
                <div key={event.id} className="grid grid-cols-[1.1fr_0.8fr_0.7fr_1fr] gap-3 border-t border-stone-200 bg-white px-4 py-3 text-sm">
                  <div>
                    <p className="font-mono text-xs font-semibold text-stone-800">{event.projectKey}/{event.sourceType}/{event.appId}</p>
                    <p className="mt-1 text-xs text-stone-500">{event.environment} • {fmtAge(event.receivedAt)}</p>
                  </div>
                  <div>
                    <p className="font-medium text-stone-800">{event.event}</p>
                    <p className="mt-1 text-xs text-stone-500">{event.service || event.host || "-"}</p>
                  </div>
                  <div>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${appStatusPillClasses(event.status, event.severity)}`}>
                      {event.status || event.severity || "-"}
                    </span>
                  </div>
                  <div>
                    <p className="font-mono text-xs text-stone-700">{fmtMetric(event)}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-stone-500">{event.message || "-"}</p>
                  </div>
                </div>
              )) : (
                <div className="border-t border-stone-200 bg-white px-4 py-6 text-sm text-stone-500">
                  Recent app/server events will appear here once Onibako or another product posts telemetry.
                </div>
              )}
            </div>
          </article>
        </section>

        <section data-widget-id="device-cards" data-widget-title="Device Cards" data-widget-cols="12" data-widget-rows="3" data-widget-body-class="grid gap-3 md:grid-cols-2 xl:grid-cols-3" className="rounded-[20px] border border-stone-300/70 bg-white/62 p-2 shadow-sm lg:col-span-12">
          {devices.map((d) => {
            const last = d.events[0];
            const health = deviceHealth.find((device) => device.deviceId === d.deviceId);
            const online = isOnline(d.lastSeenAt);

            return (
              <article key={d.id} className="rounded-[20px] border border-stone-300/80 bg-white/90 p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="font-mono text-sm font-semibold">{d.projectKey}/{d.deviceId}</h2>
                  <span className={`rounded-full px-2.5 py-1 text-xs ${health ? statusPillClasses(health.status) : online ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                    {health ? statusLabel(health.status) : online ? "online" : "stale"}
                  </span>
                </div>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between"><dt className="text-neutral-500">Last seen</dt><dd>{fmtTime(d.lastSeenAt)}</dd></div>
                  <div className="flex justify-between"><dt className="text-neutral-500">Age</dt><dd>{fmtAge(d.lastSeenAt)}</dd></div>
                  <div className="flex justify-between"><dt className="text-neutral-500">Mode</dt><dd>{d.lastMode || "-"}</dd></div>
                  <div className="flex justify-between"><dt className="text-neutral-500">App</dt><dd>{d.appVersion || "-"}</dd></div>
                  <div className="flex justify-between"><dt className="text-neutral-500">Last event</dt><dd>{last?.event || "-"}</dd></div>
                  <div className="flex justify-between"><dt className="text-neutral-500">Mem free</dt><dd>{last?.memFree ?? "-"}</dd></div>
                  <div className="flex justify-between"><dt className="text-neutral-500">NTP</dt><dd>{last?.ntpOk === null || last?.ntpOk === undefined ? "-" : String(last.ntpOk)}</dd></div>
                  <div className="flex justify-between"><dt className="text-neutral-500">Longest gap</dt><dd>{fmtDuration(health?.maxGapSeconds)}</dd></div>
                </dl>
              </article>
            );
          })}
        </section>

        <section data-widget-id="recent-events" data-widget-title="Recent Events" data-widget-cols="12" data-widget-rows="3" data-widget-collapsed-default="true" className="rounded-[20px] border border-stone-300/70 bg-white/62 p-2 shadow-sm lg:col-span-12">
          <RecentEventsTable events={recentEventsTableRows} timezoneOffsetHours={DASHBOARD_UTC_OFFSET_HOURS} />
        </section>
        </WidgetCanvas>
      </main>
    </div>
  );
}
