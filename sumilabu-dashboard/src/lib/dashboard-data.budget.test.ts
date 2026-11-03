import { beforeEach, describe, expect, it, vi } from "vitest";

import { nextCacheStandIn } from "@/lib/board/memoryCache";

import { forgetDashboardData, getProjectData, getProjectLists } from "./dashboard-data";

/*
 * SUMILABU-15: what one view of the dashboard (`/`) may cost the database.
 * The page reads only `getProjectLists` and `getProjectData`, both through
 * the data cache. Budget: at most 7 queries when something has arrived since
 * the last view (2 project lists, 4 tables, 1 latest event per device), and
 * none when nothing has.
 */
const queries = vi.hoisted(() => ({ count: 0 }));

vi.mock("next/cache", async () => (await import("@/lib/board/memoryCache")).memoryCache());
vi.mock("@/lib/prisma", () => {
  const counted = async () => {
    queries.count += 1;
    return [];
  };
  return {
    prisma: {
      device: { findMany: counted },
      deviceEvent: { findMany: counted },
      appTelemetrySource: { findMany: counted },
      appTelemetryEvent: { findMany: counted },
      $queryRaw: counted,
    },
  };
});

async function pageView(project: string[] | null) {
  const before = queries.count;
  await getProjectLists();
  await getProjectData(project);
  return queries.count - before;
}

beforeEach(() => {
  nextCacheStandIn.clear();
  queries.count = 0;
});

describe("a dashboard view's database budget", () => {
  it("is at most 7 queries after telemetry arrived, and 0 when nothing did", async () => {
    expect(await pageView(null)).toBeLessThanOrEqual(7);
    expect(await pageView(null)).toBe(0);
    forgetDashboardData();
    expect(await pageView(null)).toBeLessThanOrEqual(7);
    expect(await pageView(null)).toBe(0);
  });

  it("keeps each project's view apart, each within the budget", async () => {
    expect(await pageView(["inkyframe"])).toBeLessThanOrEqual(7);
    expect(await pageView(["onibako"])).toBeLessThanOrEqual(5); // the project lists are shared
    expect(await pageView(["inkyframe"])).toBe(0);
  });
});
