import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every API route, its methods, and what lets a caller in (SUMILABU-7).
 *
 * The page gate (`src/proxy.ts`) leaves `/api/…` alone because each route
 * checks its own bearer token. That is only true while every route really
 * does, so this list is the audit, kept: a route that is added, or that gains
 * a method, fails here until somebody writes down what guards it. `public`
 * is for a route that hands back no data at all; anything else names the
 * function in the file that checks the token, and the test reads the file to
 * see that it is called.
 */
type Guard = { kind: "token"; checks: string; tokens: string } | { kind: "public"; why: string };

const ROUTES: Record<string, { methods: string[]; guard: Guard }> = {
  "app-telemetry": { methods: ["POST"], guard: { kind: "token", checks: "isAuthorizedIngest", tokens: "PROJECT_TOKENS_JSON[project] or INGEST_API_TOKEN" } },
  "device-stats": { methods: ["POST"], guard: { kind: "token", checks: "isAuthorizedIngest", tokens: "PROJECT_TOKENS_JSON[project] or INGEST_API_TOKEN" } },
  "v1/telemetry/events": { methods: ["POST"], guard: { kind: "token", checks: "isAuthorizedIngest", tokens: "PROJECT_TOKENS_JSON[project] or INGEST_API_TOKEN" } },
  health: { methods: ["GET"], guard: { kind: "public", why: "the deploy's smoke check: says only whether the database answers" } },
  openapi: { methods: ["GET"], guard: { kind: "public", why: "a constant: the telemetry contract, already public in this repository" } },
  "openapi.json": { methods: ["GET"], guard: { kind: "public", why: "the same constant" } },
  "auth/[...nextauth]": { methods: ["GET", "POST"], guard: { kind: "public", why: "next-auth's Google sign-in; hands out a session only to an address on SUMILABU_ADMIN_EMAILS" } },
  "v1/health": { methods: ["GET"], guard: { kind: "token", checks: "authorizeAnyBoard", tokens: "any REPORTS_TOKENS_JSON entry" } },
  "v1/calendar/upcoming": { methods: ["GET"], guard: { kind: "token", checks: "authorized(req)", tokens: "CALENDAR_TOKEN" } },
  "v1/scorecard": { methods: ["POST"], guard: { kind: "token", checks: "authorized(req)", tokens: "SCORECARD_TOKEN" } },
  "v1/projects": { methods: ["GET"], guard: { kind: "token", checks: "authorizeAnyBoard", tokens: "any BOARD_TOKENS_JSON entry" } },
  "v1/projects/[projectKey]/tickets": { methods: ["GET", "POST"], guard: { kind: "token", checks: "requireCaller", tokens: "BOARD_TOKENS_JSON[project]" } },
  "v1/projects/[projectKey]/tickets/bulk": { methods: ["POST"], guard: { kind: "token", checks: "requireCaller", tokens: "BOARD_TOKENS_JSON[project]" } },
  "v1/projects/[projectKey]/tickets/import": { methods: ["POST"], guard: { kind: "token", checks: "requireCaller", tokens: "BOARD_TOKENS_JSON[project]" } },
  "v1/projects/[projectKey]/tickets/[ticketId]": { methods: ["GET", "PATCH"], guard: { kind: "token", checks: "requireCaller", tokens: "BOARD_TOKENS_JSON[project]" } },
  "v1/projects/[projectKey]/tickets/[ticketId]/ship": { methods: ["POST"], guard: { kind: "token", checks: "requireCaller", tokens: "BOARD_TOKENS_JSON[project]" } },
  "v1/projects/[projectKey]/tickets/[ticketId]/unship": { methods: ["POST"], guard: { kind: "token", checks: "requireCaller", tokens: "BOARD_TOKENS_JSON[project]" } },
  "v1/projects/[projectKey]/tickets/[ticketId]/stamp": { methods: ["POST"], guard: { kind: "token", checks: "requireCaller", tokens: "BOARD_TOKENS_JSON[project]" } },
  "v1/projects/[projectKey]/tickets/[ticketId]/images": { methods: ["GET", "POST"], guard: { kind: "token", checks: "requireCaller", tokens: "BOARD_TOKENS_JSON[project]" } },
  "v1/projects/[projectKey]/tickets/[ticketId]/images/[imageId]": { methods: ["GET"], guard: { kind: "token", checks: "requireCaller", tokens: "BOARD_TOKENS_JSON[project]" } },
  "v1/projects/[projectKey]/settings": { methods: ["GET"], guard: { kind: "token", checks: "requireCaller", tokens: "SETTINGS_TOKENS_JSON[project]" } },
  "v1/projects/[projectKey]/settings/[key]": { methods: ["GET", "PUT", "DELETE"], guard: { kind: "token", checks: "requireCaller", tokens: "SETTINGS_TOKENS_JSON[project]" } },
  "v1/projects/[projectKey]/reports": { methods: ["GET", "POST"], guard: { kind: "token", checks: "requireCaller", tokens: "REPORTS_TOKENS_JSON[project]" } },
  "v1/projects/[projectKey]/reports/import": { methods: ["POST"], guard: { kind: "token", checks: "requireCaller", tokens: "REPORTS_TOKENS_JSON[project]" } },
  "v1/projects/[projectKey]/reports/[id]": { methods: ["GET", "PATCH", "DELETE"], guard: { kind: "token", checks: "requireCaller", tokens: "REPORTS_TOKENS_JSON[project]" } },
  "v1/projects/[projectKey]/reports/[id]/file": { methods: ["POST"], guard: { kind: "token", checks: "requireCaller", tokens: "BOARD_TOKENS_JSON[project]" } },
  "v1/projects/[projectKey]/reports/[id]/image": { methods: ["GET"], guard: { kind: "token", checks: "authorizeBoard", tokens: "REPORTS_ or BOARD_TOKENS_JSON[project]" } },
};

const API = __dirname;

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name === "route.ts" ? [path] : [];
  });
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

/** The HTTP methods a route file exports, by function or by re-export. */
function exportedMethods(source: string): string[] {
  return METHODS.filter((m) => new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b|export\\s+const\\s+${m}\\b|export\\s*\\{[^}]*\\b(as\\s+)?${m}\\b[^}]*\\}`).test(source));
}

const files = routeFiles(API).map((file) => ({ route: relative(API, file).replace(/\/?route\.ts$/, ""), source: readFileSync(file, "utf8") }));

describe("every API route is accounted for", () => {
  it("has no route the list does not name, and no name without a route", () => {
    expect(files.map((f) => f.route).sort()).toEqual(Object.keys(ROUTES).sort());
  });

  it.each(files.map((f) => [f.route, f] as const))("%s: its methods are the listed ones, and a token route calls its check", (route, file) => {
    const entry = ROUTES[route];
    expect(exportedMethods(file.source)).toEqual(entry.methods);
    if (entry.guard.kind === "token") {
      const name = entry.guard.checks.replace(/\(.*$/, "");
      expect(file.source).toMatch(new RegExp(`\\b${name}\\(`));
    }
  });

  it("keeps the public list short and data-free", () => {
    expect(Object.entries(ROUTES).filter(([, e]) => e.guard.kind === "public").map(([r]) => r).sort()).toEqual(["auth/[...nextauth]", "health", "openapi", "openapi.json"]);
  });
});
