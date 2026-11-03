import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COOKIE_NAME, TEST_ADMINS, TEST_SECRET, jar, sessionToken } from "@/lib/auth/testSession";

const { cookieJar } = vi.hoisted(() => ({ cookieJar: { current: {} as Record<string, string> } }));
vi.mock("next/headers", () => ({ cookies: async () => jar(cookieJar.current) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/packages", redirect: vi.fn() }));

const { AdminToolbar } = await import("./admin-toolbar");
const render = async () => {
  const element = await AdminToolbar();
  return element ? renderToStaticMarkup(element) : "";
};

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", TEST_SECRET);
  vi.stubEnv("SUMILABU_ADMIN_EMAILS", TEST_ADMINS);
  vi.stubEnv("NEXTAUTH_URL", "");
  vi.stubEnv("VERCEL", "");
  cookieJar.current = {};
});
afterEach(() => vi.unstubAllEnvs());

describe("the admin toolbar", () => {
  it("draws nothing signed out", async () => {
    expect(await render()).toBe("");
  });

  it("links every page and the API, names who is signed in, and signs out", async () => {
    cookieJar.current = { [COOKIE_NAME]: await sessionToken("john@spxis.com") };
    const html = await render();
    expect(html).toContain('data-testid="admin-toolbar"');
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/packages"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="/api/openapi.json"');
    expect(html).toContain("john@spxis.com");
    expect(html).toContain('data-testid="sign-out"');
    expect(html).not.toContain("<details");
  });
});
