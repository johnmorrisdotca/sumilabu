import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

/* scripts/upload-scorecard.sh against a fake `curl` and a fake `security`:
   nothing here reaches the network or the real keychain. The point is that the
   key goes to curl on standard input and nowhere else. */

const SCRIPT = path.resolve(__dirname, "../../../scripts/upload-scorecard.sh");
const KEY = "canary-key-9f3a";

function setup(curlCode = "200") {
  const dir = mkdtempSync(path.join(tmpdir(), "scorecard-upload-"));
  const bin = path.join(dir, "bin");
  mkdirSync(bin);
  const log = path.join(dir, "curl.log");
  // The fake curl records its arguments and standard input, writes a reply to the -o file, prints the code.
  writeFileSync(
    path.join(bin, "curl"),
    `#!/bin/bash
out=""; prev=""
for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done
{ echo "ARGS: $*"; echo "STDIN:"; cat; } > "${log}"
echo '{"ok":true}' > "$out"
printf '%s' "${curlCode}"
`,
  );
  writeFileSync(path.join(bin, "security"), `#!/bin/bash\necho "${KEY}"\n`);
  chmodSync(path.join(bin, "curl"), 0o755);
  chmodSync(path.join(bin, "security"), 0o755);
  const file = path.join(dir, "latest.json");
  writeFileSync(file, '{"schemaVersion":1}');
  return { dir, bin, log, file };
}

function run(env: Record<string, string>, args: string[], bin: string) {
  return spawnSync("bash", [SCRIPT, ...args], {
    env: { PATH: `${bin}:/usr/bin:/bin`, HOME: "/nonexistent", ...env, NODE_ENV: "test" },
    encoding: "utf8",
  });
}

describe("scripts/upload-scorecard.sh", () => {
  it("posts the file with the key read from the keychain, and the key only on stdin", () => {
    const s = setup();
    const r = run({}, [s.file], s.bin);
    expect(r.status).toBe(0);
    const log = readFileSync(s.log, "utf8");
    const [args, stdin] = log.split("STDIN:\n");
    expect(args).toContain("-X POST");
    expect(args).toContain(`--data-binary @${s.file}`);
    expect(args).toContain("https://app.sumilabu.com/api/v1/scorecard");
    expect(args).not.toContain(KEY);
    expect(stdin).toContain(`Authorization: Bearer ${KEY}`);
    expect(r.stdout + r.stderr).not.toContain(KEY);
    expect(r.stdout).toContain('200 {"ok":true}');
  });

  it("prefers $SCORECARD_TOKEN and a SCORECARD_URL on localhost", () => {
    const s = setup();
    const r = run({ SCORECARD_TOKEN: "env-key", SCORECARD_URL: "http://localhost:6501/api/v1/scorecard" }, [s.file], s.bin);
    expect(r.status).toBe(0);
    const log = readFileSync(s.log, "utf8");
    expect(log).toContain("http://localhost:6501/api/v1/scorecard");
    expect(log).toContain("Bearer env-key");
  });

  it("exits non-zero and says why when the site refuses the run", () => {
    const s = setup("422");
    const r = run({}, [s.file], s.bin);
    expect(r.status).not.toBe(0);
    expect(r.stdout).toContain("422");
  });

  it("refuses to send the key anywhere but https or localhost", () => {
    const s = setup();
    const r = run({ SCORECARD_URL: "http://example.com/api/v1/scorecard" }, [s.file], s.bin);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("refusing to send the key");
  });

  it("stops with a sentence when the file is missing or over the site's limit", () => {
    const s = setup();
    expect(run({}, [path.join(s.dir, "nope.json")], s.bin)).toMatchObject({ status: 2 });
    writeFileSync(s.file, "x".repeat(1024 * 1024 + 1));
    const big = run({}, [s.file], s.bin);
    expect(big.status).toBe(2);
    expect(big.stderr).toContain("accepts at most");
  });

  it("stops when there is no key anywhere", () => {
    const s = setup();
    writeFileSync(path.join(s.bin, "security"), "#!/bin/bash\nexit 44\n");
    const r = run({}, [s.file], s.bin);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("no key");
  });
});
