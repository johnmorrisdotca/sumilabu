import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COOKIE_NAME, TEST_ADMINS, TEST_SECRET, jar, sessionToken } from "@/lib/auth/testSession";

const { getProjectLists, getProjectData, cookieJar, redirect } = vi.hoisted(() => ({
  getProjectLists: vi.fn(),
  getProjectData: vi.fn(),
  cookieJar: { current: {} as Record<string, string> },
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));

vi.mock("@/lib/dashboard-data", () => ({
  getProjectLists,
  getProjectData,
  EMPTY_PROJECT_DATA: { deviceRows: [], projectEvents: [], appSources: [], appEvents: [], latestEvents: [] },
}));
vi.mock("next/navigation", () => ({ redirect, usePathname: () => "/", useRouter: () => ({ refresh() {}, push() {}, replace() {}, prefetch() {} }) }));
vi.mock("next/headers", () => ({ cookies: async () => jar(cookieJar.current) }));

const { default: Home } = await import("./page");
const render = async () => renderToStaticMarkup(await Home({ searchParams: Promise.resolve({}) }));

const seen = new Date();
const device = { id: "d1", projectKey: "secret-project", deviceId: "office-inkyframe-7", appVersion: "9.9.9", lastMode: "clock", lastSeenAt: seen, heartbeatIntervalSeconds: 900, createdAt: seen, updatedAt: seen };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AUTH_SECRET", TEST_SECRET);
  vi.stubEnv("SUMILABU_ADMIN_EMAILS", TEST_ADMINS);
  vi.stubEnv("NEXTAUTH_URL", "");
  vi.stubEnv("VERCEL", "");
  cookieJar.current = {};
  getProjectLists.mockResolvedValue({ deviceProjects: ["secret-project"], appSourceProjects: [] });
  getProjectData.mockResolvedValue({ deviceRows: [device], projectEvents: [], appSources: [], appEvents: [], latestEvents: [] });
});
afterEach(() => vi.unstubAllEnvs());

describe("the dashboard is private", () => {
  it("sends a signed-out visitor to the sign-in before any read", async () => {
    await expect(render()).rejects.toThrow("NEXT_REDIRECT /signin");
    expect(getProjectLists).not.toHaveBeenCalled();
    expect(getProjectData).not.toHaveBeenCalled();
  });

  it("does the same for a session whose address is not on the list", async () => {
    cookieJar.current = { [COOKIE_NAME]: await sessionToken("stranger@gmail.com") };
    await expect(render()).rejects.toThrow("NEXT_REDIRECT /signin");
    expect(getProjectLists).not.toHaveBeenCalled();
  });

  it("draws devices for the signed-in admin", async () => {
    cookieJar.current = { [COOKIE_NAME]: await sessionToken("john@spxis.com") };
    const html = await render();
    expect(getProjectLists).toHaveBeenCalledTimes(1);
    expect(html).toContain("office-inkyframe-7");
  });
});
