import { describe, expect, it } from "vitest";

import { TOKEN_SCOPES, tokenFor } from "./auth";

/*
 * Two maps, two scopes. A worktree's board key must not open the settings
 * routes, because a setting decides who may sign up, and a dev project is a
 * separate entry so a test run cannot reach the real rows by accident.
 */
describe("tokenFor", () => {
  const env = {
    BOARD_TOKENS_JSON: JSON.stringify({ umakuma: "board-real", "umakuma-dev": "board-dev" }),
    SETTINGS_TOKENS_JSON: JSON.stringify({ umakuma: "settings-real" }),
  };

  it("reads each scope from its own map", () => {
    expect(tokenFor(TOKEN_SCOPES.board, "umakuma", env)).toBe("board-real");
    expect(tokenFor(TOKEN_SCOPES.settings, "umakuma", env)).toBe("settings-real");
  });

  it("never answers a scope from the other map", () => {
    expect(tokenFor(TOKEN_SCOPES.settings, "umakuma-dev", env)).toBeNull();
    expect(tokenFor(TOKEN_SCOPES.board, "itsutsu", env)).toBeNull();
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
