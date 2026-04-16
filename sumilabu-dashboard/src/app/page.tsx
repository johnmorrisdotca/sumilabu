import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const STALE_AFTER_SECONDS = Number(process.env.STALE_AFTER_SECONDS || "900");
const CHART_WIDTH = 720;
const CHART_HEIGHT = 240;
const CHART_PADDING_X = 28;
const CHART_PADDING_Y = 20;

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

type ChartPoint = {
  x: number;
  y: number;
  label: string;
  memFree: number;
  event: string;
};

function fmtTime(ts?: Date | null): string {
  if (!ts) {
    return "never";
  }
  return ts.toISOString().replace("T", " ").slice(0, 19);
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
      label: event.receivedAt.toISOString().slice(11, 16),
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

type PageProps = {
  searchParams?: Promise<{ project?: string }>;
};

export default async function Home({ searchParams }: PageProps) {
  const params = (await searchParams) || {};

  const [deviceProjects, eventProjects] = await Promise.all([
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
  ]);

  const availableProjects = uniqSorted([
    process.env.DEFAULT_PROJECT_KEY || "default",
    ...deviceProjects.map((project) => project.projectKey),
    ...eventProjects.map((project) => project.projectKey),
  ]);

  const selectedProject = availableProjects.includes(params.project || "")
    ? (params.project as string)
    : (process.env.DEFAULT_PROJECT_KEY || availableProjects[0] || "default");

  const devices: DeviceCard[] = await prisma.device.findMany({
    where: { projectKey: selectedProject },
    orderBy: { lastSeenAt: "desc" },
    include: {
      events: {
        orderBy: { receivedAt: "desc" },
        take: 1,
      },
    },
  });

  const recentEvents: RecentEvent[] = await prisma.deviceEvent.findMany({
    where: { projectKey: selectedProject },
    orderBy: { receivedAt: "desc" },
    take: 60,
  });

  const onlineDevices = devices.filter((device) => isOnline(device.lastSeenAt)).length;
  const chartPoints = buildMemChartPoints(recentEvents);
  const chartLine = chartPath(chartPoints);
  const chartMin = chartPoints.length ? Math.min(...chartPoints.map((point) => point.memFree)) : null;
  const chartMax = chartPoints.length ? Math.max(...chartPoints.map((point) => point.memFree)) : null;
  const latestEvent = recentEvents[0] || null;
  const breakdown = eventBreakdown(recentEvents);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5f0e8_0%,#ece6dc_52%,#e1d8cb_100%)] text-stone-900">
      <main className="mx-auto max-w-7xl p-6 md:p-8">
        <header className="mb-6 overflow-hidden rounded-[28px] border border-stone-300/80 bg-[radial-gradient(circle_at_top_left,#fff7ed_0%,#f5efe5_42%,#ebe1d3_100%)] p-6 shadow-[0_12px_40px_rgba(68,54,40,0.10)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">SumiLabu Fleet</p>
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Telemetry for live SumiLabu products</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600 md:text-base">
                The InkyFrame is the first supported SumiLabu app. This dashboard tracks heartbeat, mode changes, memory data, and recent ingest activity for each project partition.
              </p>
            </div>

            <div className="grid min-w-[280px] gap-3 rounded-2xl border border-stone-300/80 bg-white/75 p-4 backdrop-blur">
              <div className="flex items-center justify-between text-sm">
                <span className="text-stone-500">Current project</span>
                <span className="font-mono text-xs text-stone-700">{selectedProject}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-stone-500">Devices online</span>
                <span className="text-lg font-semibold text-emerald-700">{onlineDevices}/{devices.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-stone-500">Latest ingest</span>
                <span className="font-mono text-xs text-stone-700">{fmtTime(latestEvent?.receivedAt)}</span>
              </div>
            </div>
          </div>

          <nav className="mt-6 flex flex-wrap gap-2">
            {availableProjects.map((projectKey) => {
              const active = projectKey === selectedProject;
              return (
                <a
                  key={projectKey}
                  href={`/?project=${encodeURIComponent(projectKey)}`}
                  className={`rounded-full border px-4 py-2 text-sm transition ${active ? "border-stone-900 bg-stone-900 text-stone-50" : "border-stone-300 bg-white/80 text-stone-700 hover:border-stone-500 hover:bg-white"}`}
                >
                  {projectKey}
                </a>
              );
            })}
          </nav>
        </header>

        <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-[24px] border border-stone-300/80 bg-white/85 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Devices</p>
            <p className="mt-3 text-3xl font-semibold">{devices.length}</p>
            <p className="mt-2 text-sm text-stone-600">Tracked under this project key.</p>
          </article>
          <article className="rounded-[24px] border border-stone-300/80 bg-white/85 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Online Now</p>
            <p className="mt-3 text-3xl font-semibold text-emerald-700">{onlineDevices}</p>
            <p className="mt-2 text-sm text-stone-600">Seen within the last {STALE_AFTER_SECONDS}s.</p>
          </article>
          <article className="rounded-[24px] border border-stone-300/80 bg-white/85 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Recent Events</p>
            <p className="mt-3 text-3xl font-semibold">{recentEvents.length}</p>
            <p className="mt-2 text-sm text-stone-600">Most recent telemetry rows loaded in the dashboard.</p>
          </article>
          <article className="rounded-[24px] border border-stone-300/80 bg-white/85 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Top Event</p>
            <p className="mt-3 text-2xl font-semibold">{breakdown[0]?.label || "-"}</p>
            <p className="mt-2 text-sm text-stone-600">{breakdown[0]?.value || 0} events in the current sample window.</p>
          </article>
        </section>

        <section className="mb-6 grid gap-6 xl:grid-cols-[1.7fr_1fr]">
          <article className="rounded-[28px] border border-stone-300/80 bg-white/90 p-5 shadow-sm">
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

          <article className="rounded-[28px] border border-stone-300/80 bg-white/90 p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Ingest shape</h2>
            <p className="mt-1 text-sm text-stone-600">What the API is receiving for <span className="font-mono">{selectedProject}</span>.</p>
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

        <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {devices.map((d) => {
            const last = d.events[0];
            const online = isOnline(d.lastSeenAt);

            return (
              <article key={d.id} className="rounded-[24px] border border-stone-300/80 bg-white/90 p-5 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="font-mono text-sm font-semibold">{d.projectKey}/{d.deviceId}</h2>
                  <span className={`rounded-full px-2.5 py-1 text-xs ${online ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                    {online ? "online" : "stale"}
                  </span>
                </div>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between"><dt className="text-neutral-500">Last seen</dt><dd>{fmtTime(d.lastSeenAt)}</dd></div>
                  <div className="flex justify-between"><dt className="text-neutral-500">Mode</dt><dd>{d.lastMode || "-"}</dd></div>
                  <div className="flex justify-between"><dt className="text-neutral-500">App</dt><dd>{d.appVersion || "-"}</dd></div>
                  <div className="flex justify-between"><dt className="text-neutral-500">Last event</dt><dd>{last?.event || "-"}</dd></div>
                  <div className="flex justify-between"><dt className="text-neutral-500">Mem free</dt><dd>{last?.memFree ?? "-"}</dd></div>
                  <div className="flex justify-between"><dt className="text-neutral-500">NTP</dt><dd>{last?.ntpOk === null || last?.ntpOk === undefined ? "-" : String(last.ntpOk)}</dd></div>
                </dl>
              </article>
            );
          })}
        </section>

        <section className="rounded-[28px] border border-stone-300/80 bg-white/90 p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Recent Events</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="p-2">Time</th>
                  <th className="p-2">Project</th>
                  <th className="p-2">Device</th>
                  <th className="p-2">Event</th>
                  <th className="p-2">Mode</th>
                  <th className="p-2">MemFree</th>
                  <th className="p-2">Sync</th>
                </tr>
              </thead>
              <tbody>
                {recentEvents.map((e) => (
                  <tr key={e.id} className="border-b border-neutral-100">
                    <td className="p-2">{e.receivedAt.toISOString().replace("T", " ").slice(0, 19)}</td>
                    <td className="p-2 font-mono">{e.projectKey}</td>
                    <td className="p-2 font-mono">{e.deviceId}</td>
                    <td className="p-2">{e.event}</td>
                    <td className="p-2">{e.mode || "-"}</td>
                    <td className="p-2">{e.memFree ?? "-"}</td>
                    <td className="p-2">{e.sync || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
