#!/usr/bin/env node
/*
 * The end-to-end check of the page gate and the Google sign-in (SUMILABU-7),
 * against a running dev server, the fake Google and a throwaway Postgres
 * that run.sh started. Every request goes to 127.0.0.1; nothing here reaches
 * Google, Vercel or Neon.
 *
 * Part one is plain HTTP with a cookie jar: what a stranger, a bot, the API's
 * callers, the admin, a stranger with a Google account and an unverified
 * address each get. Part two drives a headless Chrome (software drawing, no
 * window, no sound) through the real sign-in and takes the pictures.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const env = process.env;
const BASE = env.E2E_BASE;
const GOOGLE = env.E2E_GOOGLE;
const PG = env.E2E_PG_CONTAINER;
const SHOTS = env.E2E_SHOTS;
const SEEDED = ["e2e-secret-project", "e2e-secret-device-7", "@johnmorrisdotca/kazoku-ui", "kazoku-ui"];
const ADMIN = "john@spxis.com";

let passed = 0;
const failures = [];
function check(label, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`ok   ${label}`);
  } else {
    failures.push(label);
    console.log(`FAIL ${label} ${detail}`);
  }
}

/* ---------- a browser in miniature: one cookie jar, redirects followed by hand ---------- */
function newJar() {
  const cookies = new Map();
  return {
    header: () => [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
    take(res) {
      for (const line of res.headers.getSetCookie()) {
        const [pair, ...attrs] = line.split(";");
        const eq = pair.indexOf("=");
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        const gone = attrs.some((a) => /^\s*max-age=0/i.test(a) || /^\s*expires=thu, 01 jan 1970/i.test(a)) || value === "";
        if (gone) cookies.delete(name);
        else cookies.set(name, value);
      }
    },
    names: () => [...cookies.keys()],
  };
}

async function get(jar, url, headers = {}) {
  const res = await fetch(url, { redirect: "manual", headers: { ...(jar && url.startsWith(BASE) ? { cookie: jar.header() } : {}), ...headers } });
  if (jar && url.startsWith(BASE)) jar.take(res);
  return { status: res.status, location: res.headers.get("location"), body: await res.text(), headers: res.headers };
}

async function postForm(jar, url, form, headers = {}) {
  const res = await fetch(url, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar.header(), ...headers },
    body: new URLSearchParams(form).toString(),
  });
  jar.take(res);
  return { status: res.status, location: res.headers.get("location"), body: await res.text() };
}

const noSeeded = (text) => SEEDED.every((name) => !text.includes(name));

async function setIdentity(identity) {
  const res = await fetch(`${GOOGLE}/__identity`, { method: "POST", body: JSON.stringify(identity) });
  if (!res.ok) throw new Error("fake google refused the identity");
}

/** The whole Google sign-in as next-auth's client does it; returns where the callback sent us. */
async function signIn(jar, callbackUrl) {
  const csrf = JSON.parse((await get(jar, `${BASE}/api/auth/csrf`)).body).csrfToken;
  const start = await postForm(jar, `${BASE}/api/auth/signin/google`, { csrfToken: csrf, callbackUrl, json: "true" });
  const authorize = JSON.parse(start.body).url;
  const atGoogle = await get(null, authorize);
  if (atGoogle.status !== 302) throw new Error(`fake google said ${atGoogle.status}: ${atGoogle.body}`);
  const callback = await get(jar, atGoogle.location);
  return { authorize, callback };
}

function pgMarker(text) {
  execFileSync("docker", ["exec", PG, "psql", "-U", "postgres", "-d", "sumilabu", "-c", `SELECT '${text}'`], { stdio: "ignore" });
}

/** Statements Postgres ran between two markers, other than the markers themselves (log_statement=all; Postgres logs to stderr). */
function statementsBetween(start, end) {
  const out = spawnSync("docker", ["logs", PG], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const text = `${out.stdout}${out.stderr}`;
  const from = text.indexOf(start);
  const to = text.lastIndexOf("\n", text.indexOf(end, from));
  if (from < 0 || to < 0) return ["(markers not found in the Postgres log)"];
  return text
    .slice(from, to)
    .split("\n")
    .filter((line) => /LOG:\s+(statement|execute)/.test(line) && !line.includes("e2e-marker"));
}

async function httpChecks() {
  /* ---------- signed out: pages, and the RSC payload, show nothing ---------- */
  pgMarker("e2e-marker-start");
  const stranger = newJar();
  for (const path of ["/", "/packages", "/packages?tab=x", "/future-page", "/_next/data/x/index.json"]) {
    const r = await get(stranger, `${BASE}${path}`);
    /* A pages-router data request gets the same redirect in Next's own header, not Location. */
    const where = r.location ?? r.headers.get("x-nextjs-redirect") ?? "";
    check(`signed out ${path} -> 307 to /signin`, r.status === 307 && where.includes("signin"), `${r.status} ${where}`);
    check(`signed out ${path} body holds no data`, noSeeded(r.body));
    const rsc = await get(stranger, `${BASE}${path}`, { RSC: "1" });
    check(`signed out ${path} RSC request -> 307`, rsc.status === 307 && noSeeded(rsc.body), `${rsc.status}`);
  }
  const signinPage = await get(stranger, `${BASE}/signin?callbackUrl=%2Fpackages`);
  check("signed out /signin -> 200 with the Google button", signinPage.status === 200 && signinPage.body.includes('data-testid="google-sign-in"'));
  check("signed out /signin HTML holds no device, project or package name", noSeeded(signinPage.body));
  /* Next answers a bare RSC request with its own redirect to `?_rsc`; the page's RSC payload is also inlined in the HTML above. */
  const signinRsc = await get(stranger, `${BASE}/signin`, { RSC: "1" });
  check("signed out /signin RSC request holds no data", [200, 307].includes(signinRsc.status) && noSeeded(signinRsc.body), `${signinRsc.status}`);
  check("signed out /signin's inlined RSC payload holds no data", signinPage.body.includes("self.__next_f") && noSeeded(signinPage.body));
  check("signed out /signin has no toolbar", !signinPage.body.includes("admin-toolbar"));
  const refused = await get(stranger, `${BASE}/not-allowed?error=AccessDenied`);
  check("/not-allowed -> 200 'Not allowed', no data", refused.status === 200 && refused.body.includes("Not allowed") && noSeeded(refused.body));
  const robots = await get(stranger, `${BASE}/robots.txt`);
  check("/robots.txt disallows everything", robots.status === 200 && robots.body.includes("Disallow: /"));
  pgMarker("e2e-marker-end");
  const ran = statementsBetween("e2e-marker-start", "e2e-marker-end");
  check("signed-out visits ran no database statement (a bot cannot wake Neon)", ran.length === 0, ran.join(" | "));

  /* The other-host redirect (next.config.ts) is checked against `next start` in prod-checks.mjs. */
  const otherHost = BASE.replace("localhost", "127.0.0.1");

  /* ---------- the API keeps its tokens and is never redirected ---------- */
  const board = { authorization: `Bearer ${env.E2E_BOARD_TOKEN}` };
  const noToken = await get(stranger, `${BASE}/api/v1/projects`);
  check("API without a token -> 401 JSON, not a redirect", noToken.status === 401 && noToken.body.includes("unauthorized"), `${noToken.status}`);
  const withToken = await get(stranger, `${BASE}/api/v1/projects`, board);
  check("API with a board token -> 200", withToken.status === 200 && withToken.body.includes("itsutsu-dev"), `${withToken.status}`);
  const tickets = await get(stranger, `${BASE}/api/v1/projects/itsutsu-dev/tickets`, board);
  check("ticket list with the board token -> 200", tickets.status === 200, `${tickets.status}`);
  const ticketsOtherHost = await get(null, `${otherHost}/api/v1/projects/itsutsu-dev/tickets`, board);
  check("the API answers on any host, unredirected", ticketsOtherHost.status === 200, `${ticketsOtherHost.status}`);
  const ingest = await fetch(`${BASE}/api/device-stats`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: "boot", device_id: "x" }) });
  check("telemetry without its token -> 401", ingest.status === 401, `${ingest.status}`);
  const health = await get(stranger, `${BASE}/api/health`);
  check("/api/health stays public and says only reachable", health.status === 200 && health.body === '{"ok":true,"database":"reachable"}', health.body);
  const openapi = await get(stranger, `${BASE}/api/openapi.json`);
  check("/api/openapi.json stays public", openapi.status === 200);
  const v1health = await get(stranger, `${BASE}/api/v1/health`);
  check("/api/v1/health without a reports token -> 401", v1health.status === 401);

  /* ---------- the admin signs in ---------- */
  await setIdentity({ email: ADMIN, email_verified: true, name: "John Morris" });
  const john = newJar();
  const { authorize, callback } = await signIn(john, "/packages");
  const sent = new URL(authorize);
  check("sign-in asks Google for openid email profile, with select_account and PKCE", sent.searchParams.get("scope") === "openid email profile" && sent.searchParams.get("prompt") === "select_account" && sent.searchParams.get("code_challenge_method") === "S256");
  check("the redirect URI is NEXTAUTH_URL's callback", sent.searchParams.get("redirect_uri") === `${BASE}/api/auth/callback/google`);
  check("the callback sends the admin on to /packages", callback.status === 302 && callback.location === `${BASE}/packages`, `${callback.status} ${callback.location}`);
  check("the callback sets the session cookie", john.names().includes("next-auth.session-token"), john.names().join(","));
  const pkg = await get(john, `${BASE}/packages`);
  check("signed in /packages -> 200 with the scorecard", pkg.status === 200 && pkg.body.includes("kazoku-ui"), `${pkg.status}`);
  check("signed in /packages has the toolbar with the address", pkg.body.includes('data-testid="admin-toolbar"') && pkg.body.includes(ADMIN));
  const dash = await get(john, `${BASE}/`);
  check("signed in / -> 200 with the seeded device", dash.status === 200 && dash.body.includes("e2e-secret-device-7"), `${dash.status}`);
  check("signed in / has the toolbar, Sign out and the API link", dash.body.includes('data-testid="sign-out"') && dash.body.includes('href="/api/openapi.json"'));
  const again = await get(john, `${BASE}/signin?callbackUrl=%2Fpackages`);
  check("/signin while signed in goes on to the callback", again.status === 307 && (again.location ?? "").endsWith("/packages"), `${again.status} ${again.location}`);
  const csrf = JSON.parse((await get(john, `${BASE}/api/auth/csrf`)).body).csrfToken;
  await postForm(john, `${BASE}/api/auth/signout`, { csrfToken: csrf, callbackUrl: "/signin", json: "true" });
  const after = await get(john, `${BASE}/`);
  check("after Sign out / -> 307 to /signin", after.status === 307, `${after.status}`);

  /* ---------- a stranger with a real Google account, and an unverified address ---------- */
  for (const [label, identity] of [
    ["a stranger's verified Google account", { email: "stranger@gmail.com", email_verified: true }],
    ["John's address unverified by Google", { email: ADMIN, email_verified: false }],
  ]) {
    await setIdentity(identity);
    const jar = newJar();
    const { callback: refusedCallback } = await signIn(jar, "/");
    /* next-auth refuses through its own /api/auth/error, which hands on to pages.error. */
    const handOn = refusedCallback.location ? await get(jar, refusedCallback.location) : { status: 0, location: "" };
    check(
      `${label} -> /not-allowed`,
      refusedCallback.status === 302 && (refusedCallback.location ?? "").includes("error=AccessDenied") && (handOn.location ?? "").endsWith("/not-allowed?error=AccessDenied"),
      `${refusedCallback.location} -> ${handOn.location}`,
    );
    check(`${label} gets no session cookie`, !jar.names().some((n) => n.includes("session-token")), jar.names().join(","));
    const home = await get(jar, `${BASE}/`);
    check(`${label} still cannot open /`, home.status === 307 && noSeeded(home.body));
  }
}

/* ---------- part two: a real browser, and the pictures ---------- */
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  };
  const ready = new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  return {
    ready,
    send: (method, params = {}) =>
      new Promise((resolve, reject) => {
        id += 1;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      }),
    close: () => ws.close(),
  };
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function browserChecks() {
  mkdirSync(SHOTS, { recursive: true });
  const port = env.E2E_CHROME_PORT;
  const chrome = spawn(
    env.E2E_CHROME,
    [
      "--headless=new",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--disable-gpu-compositing",
      "--mute-audio",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${port}`,
      "--remote-debugging-address=127.0.0.1",
      `--user-data-dir=${join(SHOTS, ".chrome-profile")}`,
      "--window-size=1280,900",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  console.log(`chrome pid ${chrome.pid}`);
  try {
    let version = null;
    for (let i = 0; i < 50 && !version; i += 1) {
      await pause(200);
      version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).catch(() => null);
    }
    if (!version) throw new Error("chrome did not start");
    const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
    const page = cdp(target.webSocketDebuggerUrl);
    await page.ready;
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    const evaluate = async (expression) => (await page.send("Runtime.evaluate", { expression, returnByValue: true })).result.value;
    /* The toolbar lives in the layout and survives a client-side move, so a page is known by its own text too. */
    const waitFor = async (pathPrefix, testId, text = "") => {
      for (let i = 0; i < 150; i += 1) {
        const state = await evaluate(
          `JSON.stringify({ path: location.pathname, ready: document.readyState, found: !!document.querySelector('[data-testid="${testId}"]'), text: document.body.innerText.includes(${JSON.stringify(text)}) })`,
        ).catch(() => null);
        if (state) {
          const s = JSON.parse(state);
          if (s.path === pathPrefix && s.ready === "complete" && s.found && s.text) return true;
        }
        await pause(200);
      }
      return false;
    };
    const shot = async (name) => {
      for (let i = 0; i < 25 && !(await evaluate("Array.from(document.images).every((img) => img.complete)")); i += 1) await pause(200);
      await pause(400);
      const { data } = await page.send("Page.captureScreenshot", { format: "png" });
      writeFileSync(join(SHOTS, name), Buffer.from(data, "base64"));
      console.log(`shot ${join(SHOTS, name)}`);
    };
    const desktop = () => page.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    const phone = () => page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

    await desktop();
    await setIdentity({ email: ADMIN, email_verified: true, name: "John Morris" });
    await page.send("Page.navigate", { url: `${BASE}/packages` });
    check("browser: a signed-out visit to /packages shows the sign-in", await waitFor("/signin", "google-sign-in"));
    await shot("01-sign-in.png");
    await evaluate(`document.querySelector('[data-testid="google-sign-in"]').click()`);
    check("browser: Sign in with Google lands back on /packages with the toolbar and the scorecard", await waitFor("/packages", "admin-toolbar", "kazoku-ui"));
    await shot("03-scorecard-with-toolbar.png");
    await evaluate(`document.querySelector('nav[aria-label="Site"] a[href="/"]').click()`);
    check("browser: the toolbar's Dashboard link opens / with the seeded device", await waitFor("/", "admin-toolbar", "e2e-secret-device-7"));
    await shot("02-dashboard-with-toolbar.png");
    await phone();
    await page.send("Page.reload");
    await waitFor("/", "admin-toolbar", "e2e-secret-device-7");
    const fits = await evaluate(`(() => { const t = document.querySelector('[data-testid="admin-toolbar"]'); const r = t.getBoundingClientRect(); const so = document.querySelector('[data-testid="sign-out"]').getBoundingClientRect(); return r.width <= 390 && so.right <= 390 && so.width > 0; })()`);
    check("browser: at phone width the toolbar and Sign out fit the screen", fits === true);
    await shot("05-phone-dashboard.png");
    await page.send("Page.navigate", { url: `${BASE}/packages` });
    await waitFor("/packages", "admin-toolbar", "kazoku-ui");
    await shot("06-phone-scorecard.png");
    await desktop();
    await evaluate(`document.querySelector('[data-testid="sign-out"]').click()`);
    check("browser: Sign out returns to the sign-in", await waitFor("/signin", "google-sign-in"));
    check("browser: signed out, the sign-in page shows no toolbar", (await evaluate(`!document.querySelector('[data-testid="admin-toolbar"]')`)) === true);
    await setIdentity({ email: "stranger@gmail.com", email_verified: true, name: "A Stranger" });
    await evaluate(`document.querySelector('[data-testid="google-sign-in"]').click()`);
    check("browser: a stranger's Google account lands on Not allowed", await waitFor("/not-allowed", "not-allowed"));
    await shot("04-not-allowed.png");
    page.close();
  } finally {
    chrome.kill("SIGTERM");
  }
}

try {
  await httpChecks();
  await browserChecks();
} catch (error) {
  failures.push(String(error));
  console.error(error);
}
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
