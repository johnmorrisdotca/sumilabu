import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

/* scripts/google-auth-setup.sh against a fake `security` (a keychain in a
   file) and a fake `vercel` that records its arguments and standard input:
   nothing here reaches the real keychain or Vercel. The point is that every
   value travels on standard input and is never printed or put in argv. */

const SCRIPT = path.resolve(__dirname, "../../../scripts/google-auth-setup.sh");
const CLIENT_ID = "123456789012-canaryid0abc.apps.googleusercontent.com";
const CLIENT_SECRET = "GOCSPX-canary_Secret-42xyz";
const CALLBACK = "https://app.sumilabu.com/api/auth/callback/google";

function setup({ keychain = {} as Record<string, string>, client = { web: { client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uris: [CALLBACK] } } as unknown } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "auth-setup-"));
  const bin = path.join(dir, "bin");
  mkdirSync(bin);
  const store = path.join(dir, "keychain");
  mkdirSync(store);
  for (const [item, value] of Object.entries(keychain)) writeFileSync(path.join(store, item), value);
  const securityLog = path.join(dir, "security.log");
  const vercelLog = path.join(dir, "vercel.log");
  writeFileSync(
    path.join(bin, "security"),
    `#!/bin/bash
store="${store}"
if [ "$1" = "-i" ]; then
  while IFS= read -r line; do
    echo "STDIN: $line" >> "${securityLog}"
    item=$(printf '%s' "$line" | sed -E 's/.* -s "([^"]*)".*/\\1/')
    value=$(printf '%s' "$line" | sed -E 's/.* -w "([^"]*)".*/\\1/')
    printf '%s' "$value" > "$store/$item"
  done
  exit 0
fi
echo "ARGS: $*" >> "${securityLog}"
if [ "$1" = "find-generic-password" ]; then
  item="$3"
  [ -f "$store/$item" ] || exit 44
  [ "$4" = "-w" ] && cat "$store/$item" && echo
  exit 0
fi
exit 1
`,
  );
  writeFileSync(path.join(bin, "vercel"), `#!/bin/bash\n{ echo "ARGS: $*"; printf 'STDIN: '; cat; echo; } >> "${vercelLog}"\n`);
  chmodSync(path.join(bin, "security"), 0o755);
  chmodSync(path.join(bin, "vercel"), 0o755);
  const file = path.join(dir, "client_secret_123.apps.googleusercontent.com.json");
  writeFileSync(file, JSON.stringify(client));
  return { dir, bin, store, file, securityLog, vercelLog };
}

function run(bin: string, args: string[], env: Record<string, string> = {}) {
  return spawnSync("bash", [SCRIPT, ...args], { env: { PATH: `${bin}:/usr/bin:/bin`, HOME: "/nonexistent", USER: "john", ...env, NODE_ENV: "test" }, encoding: "utf8" });
}

const read = (file: string) => (existsSync(file) ? readFileSync(file, "utf8") : "");
const vercelCalls = (log: string) =>
  read(log)
    .split("ARGS: ")
    .filter(Boolean)
    .map((chunk) => {
      const [args, stdin] = chunk.split("\nSTDIN: ");
      return { args, stdin: stdin.replace(/\n$/, "") };
    });

/* The script runs on John's Mac only (the keychain, and plutil to read the
   downloaded JSON), so on Linux CI, where plutil does not exist, it is skipped. */
const HAS_PLUTIL = spawnSync("sh", ["-c", "command -v plutil"], { encoding: "utf8" }).status === 0;

describe.skipIf(!HAS_PLUTIL)("scripts/google-auth-setup.sh (macOS)", () => {
  it("keeps the client in the keychain and adds all five settings to Vercel production, every value on stdin only", () => {
    const s = setup();
    const r = run(s.bin, [s.file]);
    expect(r.status, r.stderr).toBe(0);

    expect(read(path.join(s.store, "sumilabu GOOGLE_CLIENT_ID"))).toBe(CLIENT_ID);
    expect(read(path.join(s.store, "sumilabu GOOGLE_CLIENT_SECRET"))).toBe(CLIENT_SECRET);
    const authSecret = read(path.join(s.store, "sumilabu AUTH_SECRET"));
    expect(authSecret).toMatch(/^[0-9a-f]{64}$/);

    const calls = vercelCalls(s.vercelLog);
    expect(calls.map((c) => c.args.split(" ")[2])).toEqual(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "AUTH_SECRET", "SUMILABU_ADMIN_EMAILS", "NEXTAUTH_URL"]);
    for (const c of calls) {
      expect(c.args).toMatch(/^env add \S+ production --(no-)?sensitive --force --project sumilabu-dashboard --scope spxis-projects-0d6306b4$/);
    }
    expect(calls.map((c) => c.stdin)).toEqual([CLIENT_ID, CLIENT_SECRET, authSecret, "john@spxis.com,john@johnmorris.ca", "https://app.sumilabu.com"]);
    expect(calls.filter((c) => c.args.includes("--no-sensitive")).map((c) => c.args.split(" ")[2])).toEqual(["NEXTAUTH_URL"]);

    const argv = read(s.securityLog).split("\n").filter((l) => l.startsWith("ARGS: ")).join("\n") + calls.map((c) => c.args).join("\n");
    for (const secret of [CLIENT_ID, CLIENT_SECRET, authSecret]) {
      expect(argv).not.toContain(secret);
      expect(r.stdout + r.stderr).not.toContain(secret);
    }
    expect(r.stdout).toContain("done");
    expect(existsSync(s.file)).toBe(true);
  });

  it("reuses the AUTH_SECRET already in the keychain, so running it again signs nobody out", () => {
    const kept = "a".repeat(64);
    const s = setup({ keychain: { "sumilabu AUTH_SECRET": kept } });
    const r = run(s.bin, [s.file]);
    expect(r.status, r.stderr).toBe(0);
    expect(read(path.join(s.store, "sumilabu AUTH_SECRET"))).toBe(kept);
    expect(vercelCalls(s.vercelLog)[2].stdin).toBe(kept);
    expect(r.stdout).toContain("using the one already in the keychain");
    expect(r.stdout).not.toContain(kept);
  });

  it("deletes the downloaded file with --delete-source", () => {
    const s = setup();
    const r = run(s.bin, [s.file, "--delete-source"]);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(s.file)).toBe(false);
  });

  it("warns, and still goes on, when the client does not list the callback", () => {
    const s = setup({ client: { web: { client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uris: ["https://elsewhere.example/cb"] } } });
    const r = run(s.bin, [s.file]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`does not list ${CALLBACK}`);
  });

  it.each([
    ["a Desktop client", { installed: { client_id: CLIENT_ID, client_secret: CLIENT_SECRET } }],
    ["a secret with a quote in it", { web: { client_id: CLIENT_ID, client_secret: 'abc" -w "x', redirect_uris: [CALLBACK] } }],
    ["an id that is not Google's", { web: { client_id: "evil", client_secret: CLIENT_SECRET, redirect_uris: [CALLBACK] } }],
  ])("refuses %s and changes nothing", (_label, client) => {
    const s = setup({ client });
    const r = run(s.bin, [s.file]);
    expect(r.status).toBe(2);
    expect(read(s.vercelLog)).toBe("");
    expect(read(s.securityLog)).toBe("");
    expect(r.stdout + r.stderr).not.toContain(CLIENT_SECRET);
  });

  it("refuses a missing file and no file", () => {
    const s = setup();
    expect(run(s.bin, ["/nonexistent/x.json"]).status).toBe(2);
    expect(run(s.bin, []).status).toBe(2);
    expect(read(s.vercelLog)).toBe("");
  });
});
