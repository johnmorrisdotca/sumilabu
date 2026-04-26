import { prisma } from "@/lib/prisma";
import { formatDateTimeAtOffset } from "@/lib/timezone";

const DEFAULT_STALE_AFTER_SECONDS = 900;
const DEFAULT_EXPECTED_HEARTBEAT_SECONDS = 300;
const DEFAULT_SUMMARY_UTC_OFFSET_HOURS = -8;

type SummaryEvent = {
  deviceId: string;
  event: string;
  memFree: number | null;
  mode: string | null;
  projectKey: string;
  raw: unknown;
  receivedAt: Date;
};

type DeviceSummary = {
  appVersion: string | null;
  deviceId: string;
  lastMode: string | null;
  lastSeenAt: Date | null;
  latestGapSeconds: number | null;
  memFree: number | null;
  missedHeartbeats: number;
  status: "healthy" | "warning" | "offline";
};

type ProjectSummary = {
  activeDevices24h: number;
  devices: DeviceSummary[];
  eventCount24h: number;
  eventDelta: number;
  eventTypes: Array<{ label: string; value: number }>;
  healthyDevices: number;
  latestEventAt: Date | null;
  memFreeMax: number | null;
  memFreeMin: number | null;
  offlineDevices: number;
  projectKey: string;
  totalDevices: number;
  warningDevices: number;
};

type TelemetrySummary = {
  generatedAt: Date;
  healthSentence: string;
  periodEnd: Date;
  periodStart: Date;
  previousPeriodStart: Date;
  projects: ProjectSummary[];
  totals: {
    activeDevices24h: number;
    eventCount24h: number;
    offlineDevices: number;
    totalDevices: number;
    warningDevices: number;
  };
  timezoneOffsetHours: number;
};

function envNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fmtDuration(totalSeconds?: number | null): string {
  if (totalSeconds === null || totalSeconds === undefined) {
    return "-";
  }

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function eventBreakdown(events: SummaryEvent[]): Array<{ label: string; value: number }> {
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.event, (counts.get(event.event) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));
}

function latestGapSeconds(events: SummaryEvent[]): number | null {
  if (events.length < 2) {
    return null;
  }

  return Math.max(0, Math.floor((events[0].receivedAt.getTime() - events[1].receivedAt.getTime()) / 1000));
}

function latestMemFree(events: SummaryEvent[]): number | null {
  const event = events.find((item) => typeof item.memFree === "number");
  return event?.memFree ?? null;
}

function buildHealthSentence(summary: TelemetrySummary): string {
  if (summary.totals.totalDevices === 0) {
    return "No devices have reported yet, so there is nothing actionable today.";
  }

  if (summary.totals.offlineDevices > 0) {
    return `${summary.totals.offlineDevices} device${summary.totals.offlineDevices === 1 ? " is" : "s are"} offline and should be checked first.`;
  }

  if (summary.totals.warningDevices > 0) {
    return `${summary.totals.warningDevices} device${summary.totals.warningDevices === 1 ? " is" : "s are"} showing heartbeat gap risk, but nothing is fully offline.`;
  }

  if (summary.totals.eventCount24h === 0) {
    return "No telemetry arrived in the last 24 hours.";
  }

  return "All tracked devices that reported recently look healthy.";
}

export async function buildTelemetrySummary(now = new Date()): Promise<TelemetrySummary> {
  const staleAfterSeconds = envNumber("STALE_AFTER_SECONDS", DEFAULT_STALE_AFTER_SECONDS);
  const expectedHeartbeatSeconds = envNumber("EXPECTED_HEARTBEAT_SECONDS", DEFAULT_EXPECTED_HEARTBEAT_SECONDS);
  const timezoneOffsetHours = envNumber("SUMMARY_UTC_OFFSET_HOURS", DEFAULT_SUMMARY_UTC_OFFSET_HOURS);
  const periodEnd = now;
  const periodStart = new Date(periodEnd.getTime() - 24 * 3600 * 1000);
  const previousPeriodStart = new Date(periodStart.getTime() - 24 * 3600 * 1000);

  const [devices, recentEvents] = await Promise.all([
    prisma.device.findMany({ orderBy: [{ projectKey: "asc" }, { deviceId: "asc" }] }),
    prisma.deviceEvent.findMany({
      where: { receivedAt: { gte: previousPeriodStart, lte: periodEnd } },
      orderBy: { receivedAt: "desc" },
      take: 20000,
    }),
  ]);

  const projectKeys = Array.from(new Set([
    process.env.DEFAULT_PROJECT_KEY || "default",
    ...devices.map((device) => device.projectKey),
    ...recentEvents.map((event) => event.projectKey),
  ].filter(Boolean))).sort((left, right) => left.localeCompare(right));

  const projects = projectKeys.map((projectKey): ProjectSummary => {
    const projectDevices = devices.filter((device) => device.projectKey === projectKey);
    const projectEvents = recentEvents.filter((event) => event.projectKey === projectKey) as SummaryEvent[];
    const events24h = projectEvents.filter((event) => event.receivedAt >= periodStart);
    const previousEvents = projectEvents.filter((event) => event.receivedAt < periodStart && event.receivedAt >= previousPeriodStart);
    const eventsByDevice = new Map<string, SummaryEvent[]>();

    for (const event of projectEvents) {
      const list = eventsByDevice.get(event.deviceId) || [];
      list.push(event);
      eventsByDevice.set(event.deviceId, list);
    }

    const deviceSummaries = projectDevices.map((device): DeviceSummary => {
      const deviceEvents = eventsByDevice.get(device.deviceId) || [];
      const lastPingAgeSeconds = device.lastSeenAt
        ? Math.max(0, Math.floor((periodEnd.getTime() - device.lastSeenAt.getTime()) / 1000))
        : null;
      const gapSeconds = latestGapSeconds(deviceEvents);
      const missedHeartbeats = lastPingAgeSeconds === null
        ? 0
        : Math.max(0, Math.floor(lastPingAgeSeconds / expectedHeartbeatSeconds) - 1);

      let status: DeviceSummary["status"] = "healthy";
      if (!device.lastSeenAt || lastPingAgeSeconds === null || lastPingAgeSeconds > staleAfterSeconds) {
        status = "offline";
      } else if (
        lastPingAgeSeconds > expectedHeartbeatSeconds * 1.5
        || (gapSeconds !== null && gapSeconds > expectedHeartbeatSeconds * 2)
      ) {
        status = "warning";
      }

      return {
        appVersion: device.appVersion,
        deviceId: device.deviceId,
        lastMode: device.lastMode,
        lastSeenAt: device.lastSeenAt,
        latestGapSeconds: gapSeconds,
        memFree: latestMemFree(deviceEvents),
        missedHeartbeats,
        status,
      };
    });

    const memValues = events24h
      .map((event) => event.memFree)
      .filter((value): value is number => typeof value === "number");

    return {
      activeDevices24h: new Set(events24h.map((event) => event.deviceId)).size,
      devices: deviceSummaries,
      eventCount24h: events24h.length,
      eventDelta: events24h.length - previousEvents.length,
      eventTypes: eventBreakdown(events24h),
      healthyDevices: deviceSummaries.filter((device) => device.status === "healthy").length,
      latestEventAt: events24h[0]?.receivedAt || null,
      memFreeMax: memValues.length > 0 ? Math.max(...memValues) : null,
      memFreeMin: memValues.length > 0 ? Math.min(...memValues) : null,
      offlineDevices: deviceSummaries.filter((device) => device.status === "offline").length,
      projectKey,
      totalDevices: projectDevices.length,
      warningDevices: deviceSummaries.filter((device) => device.status === "warning").length,
    };
  });

  const summary: TelemetrySummary = {
    generatedAt: now,
    healthSentence: "",
    periodEnd,
    periodStart,
    previousPeriodStart,
    projects,
    totals: {
      activeDevices24h: projects.reduce((sum, project) => sum + project.activeDevices24h, 0),
      eventCount24h: projects.reduce((sum, project) => sum + project.eventCount24h, 0),
      offlineDevices: projects.reduce((sum, project) => sum + project.offlineDevices, 0),
      totalDevices: projects.reduce((sum, project) => sum + project.totalDevices, 0),
      warningDevices: projects.reduce((sum, project) => sum + project.warningDevices, 0),
    },
    timezoneOffsetHours,
  };

  summary.healthSentence = buildHealthSentence(summary);
  return summary;
}

export function renderTelemetrySummaryEmail(summary: TelemetrySummary): { html: string; subject: string; text: string } {
  const offset = summary.timezoneOffsetHours;
  const generatedAt = formatDateTimeAtOffset(summary.generatedAt, offset);
  const periodStart = formatDateTimeAtOffset(summary.periodStart, offset);
  const periodEnd = formatDateTimeAtOffset(summary.periodEnd, offset);
  const appBaseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || "";
  const dashboardLink = appBaseUrl ? `<a href="${escapeHtml(appBaseUrl)}" style="color:#2f6b5f">Open dashboard</a>` : "";
  const subjectStatus = summary.totals.offlineDevices > 0
    ? `${summary.totals.offlineDevices} offline`
    : summary.totals.warningDevices > 0
      ? `${summary.totals.warningDevices} warning`
      : "healthy";
  const subject = `SumiLabu telemetry daily summary: ${subjectStatus}`;

  const projectHtml = summary.projects.map((project) => {
    const eventTypes = project.eventTypes.length > 0
      ? project.eventTypes.map((item) => `${escapeHtml(item.label)} ${item.value}`).join(" · ")
      : "none";
    const projectUrl = appBaseUrl ? `${appBaseUrl}/?project=${encodeURIComponent(project.projectKey)}` : "";
    const deviceRows = project.devices.length > 0
      ? project.devices.map((device) => `
          <tr>
            <td style="padding:8px;border-top:1px solid #e7ddd0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${escapeHtml(device.deviceId)}</td>
            <td style="padding:8px;border-top:1px solid #e7ddd0">${escapeHtml(device.status)}</td>
            <td style="padding:8px;border-top:1px solid #e7ddd0">${device.lastSeenAt ? escapeHtml(formatDateTimeAtOffset(device.lastSeenAt, offset)) : "never"}</td>
            <td style="padding:8px;border-top:1px solid #e7ddd0">${escapeHtml(fmtDuration(device.latestGapSeconds))}</td>
            <td style="padding:8px;border-top:1px solid #e7ddd0">${device.memFree ?? "-"}</td>
            <td style="padding:8px;border-top:1px solid #e7ddd0">${escapeHtml(device.lastMode || "-")}</td>
          </tr>`).join("")
      : `<tr><td colspan="6" style="padding:8px;border-top:1px solid #e7ddd0;color:#786f64">No devices registered for this project yet.</td></tr>`;

    return `
      <section style="margin-top:22px;padding:18px;border:1px solid #d8cbbb;border-radius:18px;background:#fffaf3">
        <h2 style="margin:0 0 6px;font-size:18px;color:#2a2520">${escapeHtml(project.projectKey)}</h2>
        <p style="margin:0 0 14px;color:#655b50">
          ${project.healthyDevices}/${project.totalDevices} healthy · ${project.warningDevices} warning · ${project.offlineDevices} offline · ${project.eventCount24h} events (${project.eventDelta >= 0 ? "+" : ""}${project.eventDelta} vs prior day)
          ${projectUrl ? ` · <a href="${escapeHtml(projectUrl)}" style="color:#2f6b5f">view project</a>` : ""}
        </p>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:14px">
          <div style="padding:10px;border-radius:12px;background:#f1eadf"><strong>${project.activeDevices24h}</strong><br><span style="color:#655b50">active devices</span></div>
          <div style="padding:10px;border-radius:12px;background:#f1eadf"><strong>${project.latestEventAt ? escapeHtml(formatDateTimeAtOffset(project.latestEventAt, offset)) : "none"}</strong><br><span style="color:#655b50">latest ingest</span></div>
          <div style="padding:10px;border-radius:12px;background:#f1eadf"><strong>${project.memFreeMin ?? "-"} / ${project.memFreeMax ?? "-"}</strong><br><span style="color:#655b50">mem min/max</span></div>
        </div>
        <p style="margin:0 0 8px;color:#655b50">Events: ${eventTypes}</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="text-align:left;color:#655b50">
              <th style="padding:8px">Device</th>
              <th style="padding:8px">Status</th>
              <th style="padding:8px">Last seen</th>
              <th style="padding:8px">Latest gap</th>
              <th style="padding:8px">Mem</th>
              <th style="padding:8px">Mode</th>
            </tr>
          </thead>
          <tbody>${deviceRows}</tbody>
        </table>
      </section>`;
  }).join("");

  const html = `
    <div style="margin:0;padding:24px;background:#f5f0e8;color:#2a2520;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      <main style="max-width:860px;margin:0 auto">
        <section style="padding:22px;border:1px solid #d8cbbb;border-radius:22px;background:#fffdf8">
          <p style="margin:0 0 8px;font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#786f64">SumiLabu Fleet</p>
          <h1 style="margin:0 0 10px;font-size:26px">Daily telemetry summary</h1>
          <p style="margin:0 0 14px;font-size:16px;color:#4f463d">${escapeHtml(summary.healthSentence)}</p>
          <p style="margin:0;color:#655b50">Window: ${escapeHtml(periodStart)} → ${escapeHtml(periodEnd)} (UTC${offset >= 0 ? "+" : ""}${offset}) · Generated ${escapeHtml(generatedAt)} ${dashboardLink ? `· ${dashboardLink}` : ""}</p>
        </section>

        <section style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:14px">
          <div style="padding:14px;border:1px solid #d8cbbb;border-radius:16px;background:#fffdf8"><strong style="font-size:24px">${summary.totals.totalDevices}</strong><br><span style="color:#655b50">devices</span></div>
          <div style="padding:14px;border:1px solid #d8cbbb;border-radius:16px;background:#fffdf8"><strong style="font-size:24px;color:#2f6b5f">${summary.totals.activeDevices24h}</strong><br><span style="color:#655b50">active 24h</span></div>
          <div style="padding:14px;border:1px solid #d8cbbb;border-radius:16px;background:#fffdf8"><strong style="font-size:24px;color:#b7791f">${summary.totals.warningDevices}</strong><br><span style="color:#655b50">warnings</span></div>
          <div style="padding:14px;border:1px solid #d8cbbb;border-radius:16px;background:#fffdf8"><strong style="font-size:24px;color:#b33a3a">${summary.totals.offlineDevices}</strong><br><span style="color:#655b50">offline</span></div>
        </section>

        ${projectHtml}
      </main>
    </div>`;

  const text = [
    "SumiLabu daily telemetry summary",
    summary.healthSentence,
    `Window: ${periodStart} -> ${periodEnd} UTC${offset >= 0 ? "+" : ""}${offset}`,
    `Totals: ${summary.totals.totalDevices} devices, ${summary.totals.activeDevices24h} active, ${summary.totals.warningDevices} warning, ${summary.totals.offlineDevices} offline, ${summary.totals.eventCount24h} events`,
    ...summary.projects.map((project) => [
      "",
      `${project.projectKey}: ${project.healthyDevices}/${project.totalDevices} healthy, ${project.warningDevices} warning, ${project.offlineDevices} offline, ${project.eventCount24h} events (${project.eventDelta >= 0 ? "+" : ""}${project.eventDelta} vs prior day)`,
      `Events: ${project.eventTypes.map((item) => `${item.label} ${item.value}`).join("; ") || "none"}`,
      ...project.devices.map((device) => `${device.deviceId}: ${device.status}, lastSeen=${device.lastSeenAt ? formatDateTimeAtOffset(device.lastSeenAt, offset) : "never"}, latestGap=${fmtDuration(device.latestGapSeconds)}, mem=${device.memFree ?? "-"}, mode=${device.lastMode || "-"}`),
    ].join("\n")),
  ].join("\n");

  return { html, subject, text };
}

export type { TelemetrySummary };
