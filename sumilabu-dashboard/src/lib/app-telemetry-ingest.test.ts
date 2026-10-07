import { beforeEach, describe, expect, it, vi } from "vitest";

import { ingestTelemetryEvent } from "./app-telemetry-ingest";

/* Which events reach Postgres at all, and that a stored one clears the
   dashboard's cache. The database is a set of spies. */
const { upsert, create, revalidateTag } = vi.hoisted(() => ({ upsert: vi.fn(), create: vi.fn(), revalidateTag: vi.fn() }));

vi.mock("next/cache", () => ({ revalidateTag, unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/prisma", () => ({ prisma: { appTelemetrySource: { upsert }, appTelemetryEvent: { create } } }));

const payload = (event: string, project_key = "umakuma") => ({ project_key, source_id: "umakuma-web", source_type: "server" as const, event });

describe("ingestTelemetryEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsert.mockResolvedValue({ id: "src1" });
    create.mockResolvedValue({});
    delete process.env.TELEMETRY_DROP_EVENTS;
  });

  it("acknowledges a dropped event without a single query", async () => {
    const result = await ingestTelemetryEvent(payload("api_route"), {});
    expect(result).toMatchObject({ projectKey: "umakuma", dropped: true });
    expect(upsert).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("stores any other event and clears the dashboard cache", async () => {
    const result = await ingestTelemetryEvent(payload("deploy_finished"), {});
    expect(result.dropped).toBe(false);
    expect(upsert).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    expect(revalidateTag).toHaveBeenCalledWith("dashboard-data", { expire: 0 });
  });

  it("stores the same event name from a project the drop list does not name", async () => {
    await ingestTelemetryEvent(payload("api_route", "onibako"), {});
    expect(create).toHaveBeenCalledOnce();
  });
});
