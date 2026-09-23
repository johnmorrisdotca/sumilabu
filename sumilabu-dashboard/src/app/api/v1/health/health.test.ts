import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn(async () => [{ "?column?": 1 }]);
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: queryRaw } }));

const { GET } = await import("./route");

const TOKEN = "test-reports-token";

function request(token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest("http://localhost/api/v1/health", { headers });
}

beforeEach(() => {
  vi.stubEnv("REPORTS_TOKENS_JSON", JSON.stringify({ "umakuma-dev": TOKEN }));
  queryRaw.mockClear();
});

describe("GET /api/v1/health", () => {
  it("401s without a valid reports token, and runs no query", async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(queryRaw).not.toHaveBeenCalled();

    const wrong = await GET(request("wrong"));
    expect(wrong.status).toBe(401);
  });

  it("answers ok with any project's reports token, never caching at an intermediary", async () => {
    const response = await GET(request(TOKEN));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it("answers 503 when the database query fails", async () => {
    queryRaw.mockRejectedValueOnce(new Error("connection refused"));
    const response = await GET(request(TOKEN));
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
