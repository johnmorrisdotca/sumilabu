import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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

function fmtTime(ts?: Date | null): string {
  if (!ts) {
    return "never";
  }
  return ts.toISOString().replace("T", " ").slice(0, 19);
}

type PageProps = {
  searchParams?: Promise<{ project?: string }>;
};

export default async function Home({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const selectedProject = params.project || process.env.DEFAULT_PROJECT_KEY || "default";

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
    take: 50,
  });

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900">
      <main className="mx-auto max-w-6xl p-6">
        <header className="mb-6 rounded-xl bg-white p-5 shadow-sm">
          <h1 className="text-2xl font-semibold">SumiLabu Fleet Dashboard</h1>
          <p className="text-sm text-neutral-600">Neon + Vercel telemetry view for project <span className="font-mono">{selectedProject}</span> ({devices.length} devices)</p>
        </header>

        <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {devices.map((d) => {
            const last = d.events[0];
            const stale = !d.lastSeenAt;

            return (
              <article key={d.id} className="rounded-xl bg-white p-5 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="font-mono text-sm font-semibold">{d.projectKey}/{d.deviceId}</h2>
                  <span className={`rounded px-2 py-1 text-xs ${stale ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {stale ? "stale" : "online"}
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

        <section className="rounded-xl bg-white p-5 shadow-sm">
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
