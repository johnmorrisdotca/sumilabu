import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COOKIE_NAME, TEST_ADMINS, TEST_SECRET, jar, sessionToken } from "@/lib/auth/testSession";

const { cookieJar, redirect } = vi.hoisted(() => ({
  cookieJar: { current: {} as Record<string, string> },
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({ cookies: async () => jar(cookieJar.current) }));

const { default: SignIn, metadata } = await import("./page");
const NotAllowed = (await import("../not-allowed/page")).default;
const render = async (callbackUrl?: string) => renderToStaticMarkup(await SignIn({ searchParams: Promise.resolve(callbackUrl ? { callbackUrl } : {}) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AUTH_SECRET", TEST_SECRET);
  vi.stubEnv("SUMILABU_ADMIN_EMAILS", TEST_ADMINS);
  vi.stubEnv("GOOGLE_CLIENT_ID", "id.apps.googleusercontent.com");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
  vi.stubEnv("NEXTAUTH_URL", "");
  vi.stubEnv("VERCEL", "");
  cookieJar.current = {};
});
afterEach(() => vi.unstubAllEnvs());

describe("/signin", () => {
  it("offers Google and says nothing about what is behind it", async () => {
    const html = await render("/packages");
    expect(html).toContain('data-testid="google-sign-in"');
    expect(html).toContain("Private site");
    for (const word of ["john@", "device", "Package scorecard", "onibako", "inkyframe"]) expect(html).not.toContain(word);
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("says so, with no button, when sign-in is not configured", async () => {
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    const html = await render();
    expect(html).toContain("Sign-in is not set up");
    expect(html).not.toContain('data-testid="google-sign-in"');
  });

  it("sends the admin who is already signed in on to where they were going, and only to a path here", async () => {
    cookieJar.current = { [COOKIE_NAME]: await sessionToken("john@spxis.com") };
    await expect(render("/packages")).rejects.toThrow("NEXT_REDIRECT /packages");
    await expect(render("https://evil.example/")).rejects.toThrow("NEXT_REDIRECT /");
  });
});

describe("/not-allowed", () => {
  const renderRefusal = async (error?: string) => renderToStaticMarkup(await NotAllowed({ searchParams: Promise.resolve(error ? { error } : {}) }));

  it("is a plain refusal for an address that is not on the list", async () => {
    const html = await renderRefusal("AccessDenied");
    expect(html).toContain("Not allowed");
    expect(html).toContain('href="/signin"');
  });

  it("says a broken sign-in broke, in its own words", async () => {
    const html = await renderRefusal("OAuthCallback");
    expect(html).toContain("Sign-in did not work");
    expect(html).not.toContain("OAuthCallback");
  });
});
