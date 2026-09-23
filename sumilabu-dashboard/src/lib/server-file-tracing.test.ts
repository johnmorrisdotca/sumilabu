import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * A file read off disk names its folder in a string the build can see.
 *
 * Next's file tracer decides what goes into a server function by reading the
 * paths the code opens. `join(process.cwd(), "src/data/x.json")` it follows
 * exactly; `join(process.cwd(), file)` it cannot follow at all, and so it
 * packs the whole project to be safe. In umakuma that took one page's
 * function to 278 MB, over Vercel's 250 MB limit, and the deploy failed three
 * times. Nothing here reads the disk today; this keeps the first file that
 * does from doing it that way. Spell the folder out and join the variable
 * part after it.
 */
const sourceFiles = () =>
  readdirSync("src", { recursive: true, encoding: "utf8" })
    .filter((file) => /\.(ts|tsx|mjs|js)$/.test(file) && !file.includes(".test."))
    .map((file) => join("src", file));

describe("server file reads name their folder", () => {
  it("finds the source it sweeps", () => {
    expect(sourceFiles()).toContain(join("src", "lib", "prisma.ts"));
  });

  it("never joins process.cwd() straight to a variable", () => {
    const loose = /(?:join|resolve)\(\s*process\.cwd\(\)\s*,\s*[^"'`\s)]/;
    expect(sourceFiles().filter((file) => loose.test(readFileSync(file, "utf8")))).toEqual([]);
  });

  /*
   * The same hole one step removed: a constant for a whole folder, joined to a
   * file name later. umakuma's sheets each carried the whole of `src/data` -
   * forty-seven megabytes of export among it - because two helpers did this.
   */
  it("never roots a read at the whole of src or public", () => {
    const whole = /(?:join|resolve)\(\s*process\.cwd\(\)\s*,\s*(?:"src"|"public")\s*(?:\)|,\s*[^"'\s])/;
    expect(sourceFiles().filter((file) => whole.test(readFileSync(file, "utf8")))).toEqual([]);
  });
});
