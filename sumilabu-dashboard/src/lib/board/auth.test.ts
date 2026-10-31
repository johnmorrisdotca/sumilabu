import { describe, expect, it } from "vitest";

import { TOKEN_SCOPES, boardProjectKeys, tokenFor } from "./auth";

/*
 * Two maps, two scopes. A worktree's board key must not open the settings
 * routes, because a setting decides who may sign up, and a dev project is a
 * separate entry so a test run cannot reach the real rows by accident.
 */
describe("BOARD_TOKENS_EXTRA_JSON", () => {
  const env = {
    BOARD_TOKENS_JSON: JSON.stringify({ umakuma: "board-real" }),
    BOARD_TOKENS_EXTRA_JSON: JSON.stringify({ hotaru: "board-extra", umakuma: "not-this-one" }),
  };

  it("gives a project a board without touching the first setting", () => {
    expect(tokenFor(TOKEN_SCOPES.board, "hotaru", env)).toBe("board-extra");
    expect(boardProjectKeys(TOKEN_SCOPES.board, env)).toEqual(["hotaru", "umakuma"]);
  });

  it("can never replace a key the first setting holds", () => {
    expect(tokenFor(TOKEN_SCOPES.board, "umakuma", env)).toBe("board-real");
  });

  it("opens nothing but the board", () => {
    expect(tokenFor(TOKEN_SCOPES.settings, "hotaru", env)).toBeNull();
    expect(tokenFor(TOKEN_SCOPES.reports, "hotaru", env)).toBeNull();
  });

  it("a bad second setting breaks nobody", () => {
    const bad = { ...env, BOARD_TOKENS_EXTRA_JSON: "[Sensitive]" };
    expect(tokenFor(TOKEN_SCOPES.board, "umakuma", bad)).toBe("board-real");
    expect(tokenFor(TOKEN_SCOPES.board, "hotaru", bad)).toBeNull();
  });
});

describe("tokenFor", () => {
  const env = {
    BOARD_TOKENS_JSON: JSON.stringify({ umakuma: "board-real", "umakuma-dev": "board-dev" }),
    SETTINGS_TOKENS_JSON: JSON.stringify({ umakuma: "settings-real" }),
    REPORTS_TOKENS_JSON: JSON.stringify({ umakuma: "reports-real" }),
  };

  it("reads each scope from its own map", () => {
    expect(tokenFor(TOKEN_SCOPES.board, "umakuma", env)).toBe("board-real");
    expect(tokenFor(TOKEN_SCOPES.settings, "umakuma", env)).toBe("settings-real");
    expect(tokenFor(TOKEN_SCOPES.reports, "umakuma", env)).toBe("reports-real");
  });

  it("never answers a scope from another map - a leaked reports key cannot move tickets or settings", () => {
    expect(tokenFor(TOKEN_SCOPES.settings, "umakuma-dev", env)).toBeNull();
    expect(tokenFor(TOKEN_SCOPES.board, "itsutsu", env)).toBeNull();
    const reportsOnly = { REPORTS_TOKENS_JSON: env.REPORTS_TOKENS_JSON };
    expect(tokenFor(TOKEN_SCOPES.board, "umakuma", reportsOnly)).toBeNull();
    expect(tokenFor(TOKEN_SCOPES.settings, "umakuma", reportsOnly)).toBeNull();
  });

  it("treats a dev project as its own project", () => {
    expect(tokenFor(TOKEN_SCOPES.board, "umakuma-dev", env)).toBe("board-dev");
    expect(tokenFor(TOKEN_SCOPES.board, "umakuma-dev", env)).not.toBe(tokenFor(TOKEN_SCOPES.board, "umakuma", env));
  });

  it("has no token when the map is missing, empty or broken", () => {
    expect(tokenFor(TOKEN_SCOPES.settings, "umakuma", {})).toBeNull();
    expect(tokenFor(TOKEN_SCOPES.board, "umakuma", { BOARD_TOKENS_JSON: "{" })).toBeNull();
    expect(tokenFor(TOKEN_SCOPES.board, "umakuma", { BOARD_TOKENS_JSON: JSON.stringify({ umakuma: "" }) })).toBeNull();
  });
});

/*
 * Names, never tokens - what `GET /api/v1/projects` hands a client that
 * already holds one project's board token and wants to know which other
 * project keys exist before it is separately handed a token for one.
 */
describe("boardProjectKeys", () => {
  it("lists every project key configured for the scope, sorted", () => {
    const env = { BOARD_TOKENS_JSON: JSON.stringify({ umakuma: "a", itsutsu: "b", "umakuma-dev": "c" }) };
    expect(boardProjectKeys(TOKEN_SCOPES.board, env)).toEqual(["itsutsu", "umakuma", "umakuma-dev"]);
  });

  it("never lists a settings-only project under the board scope", () => {
    const env = { BOARD_TOKENS_JSON: JSON.stringify({ umakuma: "a" }), SETTINGS_TOKENS_JSON: JSON.stringify({ itsutsu: "b" }) };
    expect(boardProjectKeys(TOKEN_SCOPES.board, env)).toEqual(["umakuma"]);
  });

  it("is empty when the map is missing, empty or broken", () => {
    expect(boardProjectKeys(TOKEN_SCOPES.board, {})).toEqual([]);
    expect(boardProjectKeys(TOKEN_SCOPES.board, { BOARD_TOKENS_JSON: "{" })).toEqual([]);
    expect(boardProjectKeys(TOKEN_SCOPES.board, { BOARD_TOKENS_JSON: JSON.stringify({ umakuma: "" }) })).toEqual([]);
  });
});
