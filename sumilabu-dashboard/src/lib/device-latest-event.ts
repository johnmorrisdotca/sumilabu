import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type LatestDeviceEvent = {
  event: string;
  memFree: number | null;
  ntpOk: boolean | null;
};

type LatestDeviceEventRow = LatestDeviceEvent & { deviceRefId: string };

/**
 * Each device's newest event, in one query.
 *
 * For each device it walks the (deviceId, receivedAt desc) index to the
 * newest row and stops. It replaces `include: { events: { take: 1 } }`,
 * which Prisma answers by reading every event of every listed device and
 * keeping one per device in memory: the whole history, every render.
 */
export async function latestEventByDevice(deviceRefIds: readonly string[]): Promise<Map<string, LatestDeviceEvent>> {
  if (deviceRefIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<LatestDeviceEventRow[]>`
    SELECT d."id" AS "deviceRefId", e."event", e."memFree", e."ntpOk"
    FROM "Device" d
    CROSS JOIN LATERAL (
      SELECT "event", "memFree", "ntpOk"
      FROM "DeviceEvent"
      WHERE "DeviceEvent"."deviceId" = d."deviceId" AND "DeviceEvent"."deviceRefId" = d."id"
      ORDER BY "DeviceEvent"."receivedAt" DESC
      LIMIT 1
    ) e
    WHERE d."id" IN (${Prisma.join([...deviceRefIds])})
  `;
  return new Map(rows.map(({ deviceRefId, ...event }) => [deviceRefId, event]));
}
