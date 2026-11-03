import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WRONG_KEY_DELAY_MS, viewCookieValid } from "@/lib/scorecard/access";

const { POST } = await import("./route");

const KEY = "session-test-view-key";

function post(body: string, headers: Record<string, string> = {}) {
  return new NextRequest("https://app.sumilabu.com/packages/session", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", host: "app.sumilabu.com", origin: "https://app.sumilabu.com", ...headers },
    body,
  });
}
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();

beforeEach(() => {
  vi.stubEnv("SCORECARD_VIEW_KEY", KEY);
  vi.stubEnv("NODE_ENV", "production");
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("POST /packages/session", () => {
  it("is a 404 when the deployment has no view key, whatever is sent", async () => {
    vi.stubEnv("SCORECARD_VIEW_KEY", "");
    const res = await POST(post(form({ key: KEY })));
    expect(res.status).toBe(404);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("refuses a post that did not come from our own pages", async () => {
    for (const headers of [{ origin: "https://evil.example" }, { origin: "" }]) {
      const req = post(form({ key: KEY }), { ...headers, ...(headers.origin === "" ? { "sec-fetch-site": "cross-site" } : {}) });
      const res = await POST(req);
      expect(res.status).toBe(403);
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });

  it("answers a wrong key, after a delay, with a generic redirect and no cookie", async () => {
    const pending = POST(post(form({ key: "wrong" })));
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(WRONG_KEY_DELAY_MS - 50);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    const res = await pending;
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/packages?denied=1");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("treats a missing or empty key the same as a wrong one", async () => {
    for (const body of ["", form({ key: "" }), form({ other: "x" })]) {
      const pending = POST(post(body));
      await vi.advanceTimersByTimeAsync(WRONG_KEY_DELAY_MS + 10);
      const res = await pending;
      expect(res.headers.get("location")).toBe("/packages?denied=1");
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });

  it("gives the right key an HttpOnly, Secure, SameSite=Strict cookie for 30 days that holds a MAC, not the key", async () => {
    const res = await POST(post(form({ key: KEY })));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/packages");
    const cookie = res.headers.get("set-cookie") ?? "";
    for (const part of ["scorecard_view=", "Path=/packages", "Max-Age=2592000", "HttpOnly", "SameSite=Strict", "Secure"]) expect(cookie).toContain(part);
    expect(cookie).not.toContain(KEY);
    const value = cookie.split(";")[0].split("=")[1];
    expect(viewCookieValid(value, KEY)).toBe(true);
  });

  it("signs out by clearing the cookie, with or without a valid key in the form", async () => {
    const res = await POST(post(form({ action: "signout" })));
    expect(res.status).toBe(303);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(res.headers.get("set-cookie")).toContain("scorecard_view=;");
  });

  it("rejects a body over 4 KB before reading it as a form", async () => {
    const res = await POST(post(form({ key: "x".repeat(5000) })));
    expect(res.status).toBe(413);
  });
});
