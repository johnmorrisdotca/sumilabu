import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

/*
 * Where a device's heartbeat interval arrives and how it is stored. The
 * database is a pair of spies: the route's contract here is what it asks
 * Prisma to write, not Postgres.
 */
const { upsert, create } = vi.hoisted(() => ({ upsert: vi.fn(), create: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: { device: { upsert }, deviceEvent: { create } } }));

type UpsertArgs = {
  update: Record<string, unknown>;
  create: Record<string, unknown>;
};

function post(body: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost/api/device-stats", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const heartbeat = (extra: Record<string, unknown> = {}) => ({ project_key: "sumilabu-clock-dev", device_id: "inky-test", event: "heartbeat", ...extra });
const upserted = () => upsert.mock.calls[0][0] as UpsertArgs;

beforeEach(() => {
  delete process.env.INGEST_API_TOKEN;
  delete process.env.PROJECT_TOKENS_JSON;
  upsert.mockReset().mockResolvedValue({ id: "device-row" });
  create.mockReset().mockResolvedValue({});
});

describe("POST /api/device-stats and the heartbeat interval", () => {
  it("stores a reported interval on the device row, created or updated", async () => {
    const response = await post(heartbeat({ heartbeat_interval_s: 1800 }));
    expect(response.status).toBe(200);
    expect(upserted().create.heartbeatIntervalSeconds).toBe(1800);
    expect(upserted().update.heartbeatIntervalSeconds).toBe(1800);
  });

  it("leaves the stored interval alone when an event reports none", async () => {
    await post(heartbeat({ event: "boot" }));
    expect(upserted().update).not.toHaveProperty("heartbeatIntervalSeconds");
    expect(upserted().create.heartbeatIntervalSeconds).toBeNull();
  });

  it("ignores an unusable interval rather than refusing the heartbeat", async () => {
    for (const bad of [0, -300, "1800", 999_999]) {
      upsert.mockClear();
      const response = await post(heartbeat({ heartbeat_interval_s: bad }));
      expect(response.status).toBe(200);
      expect(upserted().update).not.toHaveProperty("heartbeatIntervalSeconds");
    }
  });

  it("records the interval it used in the event's raw copy", async () => {
    await post(heartbeat({ heartbeat_interval_s: 5 }));
    const data = (create.mock.calls[0][0] as { data: { raw: Record<string, unknown> } }).data;
    expect(data.raw.heartbeat_interval_s).toBe(5);
    expect(upserted().update.heartbeatIntervalSeconds).toBe(5);
  });
});
