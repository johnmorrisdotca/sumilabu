#!/usr/bin/env node
/*
 * The gate on a production build (`next build` + `next start`), which is
 * what Vercel runs and what `next dev` is not: the proxy's compiled matcher,
 * the host redirect (dev always calls itself localhost), and a session cookie
 * made with the run's AUTH_SECRET exactly as next-auth makes it. The fake
 * Google is not used here: production never reads it.
 */
import { spawnSync } from "node:child_process";
import { request } from "node:http";

import { encode } from "next-auth/jwt";

const env = process.env;
const BASE = env.E2E_PROD_BASE;
const SEEDED = ["e2e-secret-project", "e2e-secret-device-7", "kazoku-ui"];
const noSeeded = (text) => SEEDED.every((name) => !text.includes(name));

let passed = 0;
const failures = [];
function check(label, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`ok   prod: ${label}`);
  } else {
    failures.push(label);
    console.log(`FAIL prod: ${label} ${detail}`);
  }
}

/** fetch will not send another Host; this does, as a browser on sumilabu.com would. */
function asHost(host, path, headers = {}) {
  const { hostname, port } = new URL(BASE);
  return new Promise((resolve, reject) => {
    const req = request({ hostname: hostname === "localhost" ? "127.0.0.1" : hostname, port, path, headers: { host, ...headers } }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode, location: res.headers.location ?? null, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function get(url, headers = {}) {
  const res = await fetch(url, { redirect: "manual", headers });
  return { status: res.status, location: res.headers.get("location"), body: await res.text() };
}

const cookieFor = async (email, secret = env.E2E_AUTH_SECRET) =>
  `next-auth.session-token=${await encode({ token: { email, name: "Someone", sub: "1" }, secret, maxAge: 3600 })}`;

function pg(sql) {
  spawnSync("docker", ["exec", env.E2E_PG_CONTAINER, "psql", "-U", "postgres", "-d", "sumilabu", "-c", sql], { stdio: "ignore" });
}
function statementsBetween(start, end) {
  const out = spawnSync("docker", ["logs", env.E2E_PG_CONTAINER], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const text = `${out.stdout}${out.stderr}`;
  const from = text.lastIndexOf(start);
  const to = text.lastIndexOf("\n", text.indexOf(end, from));
  return text.slice(from, to).split("\n").filter((line) => /LOG:\s+(statement|execute)/.test(line) && !line.includes("e2e-marker"));
}

pg("SELECT 'e2e-marker-prod-start'");
for (const path of ["/", "/packages", "/anything-new"]) {
  const r = await get(`${BASE}${path}`);
  check(`signed out ${path} -> 307 to /signin, no data`, r.status === 307 && (r.location ?? "").includes("/signin") && noSeeded(r.body), `${r.status} ${r.location}`);
}
for (const [label, cookie] of [
  ["a forged cookie", "next-auth.session-token=forged"],
  ["a cookie made with another secret", await cookieFor("john@spxis.com", "another-secret-another-secret-another-secret-xx")],
  ["a valid cookie for an address not on the list", await cookieFor("stranger@gmail.com")],
]) {
  const r = await get(`${BASE}/`, { cookie });
  check(`${label} -> 307, no data`, r.status === 307 && noSeeded(r.body), `${r.status}`);
}
pg("SELECT 'e2e-marker-prod-end'");
const ran = statementsBetween("e2e-marker-prod-start", "e2e-marker-prod-end");
check("signed-out and refused visits ran no database statement", ran.length === 0, ran.join(" | "));

for (const host of ["sumilabu.com", "api.sumilabu.com", "www.sumilabu.com"]) {
  const moved = await asHost(host, "/packages?x=1");
  check(`a page on ${host} -> https://app.sumilabu.com, query kept`, moved.status === 307 && moved.location === "https://app.sumilabu.com/packages?x=1", `${moved.status} ${moved.location}`);
  const home = await asHost(host, "/");
  check(`/ on ${host} -> https://app.sumilabu.com/`, home.status === 307 && home.location === "https://app.sumilabu.com/", `${home.status} ${home.location}`);
  const auth = await asHost(host, "/api/auth/signin/google");
  check(`next-auth's routes on ${host} -> app.sumilabu.com`, auth.status === 307 && auth.location === "https://app.sumilabu.com/api/auth/signin/google", `${auth.location}`);
  const api = await asHost(host, "/api/v1/projects", { authorization: `Bearer ${env.E2E_BOARD_TOKEN}` });
  check(`the API on ${host} answers with its token, unredirected`, api.status === 200 && api.body.includes("itsutsu-dev"), `${api.status} ${api.location}`);
  const apiNoToken = await asHost(host, "/api/v1/projects");
  check(`the API on ${host} without a token -> 401, unredirected`, apiNoToken.status === 401, `${apiNoToken.status}`);
}
const appHost = await asHost("app.sumilabu.com", "/packages");
check("app.sumilabu.com itself is not redirected away (only to the sign-in)", appHost.status === 307 && (appHost.location ?? "").includes("/signin"), `${appHost.location}`);
const apiNone = await get(`${BASE}/api/v1/projects/itsutsu-dev/tickets`);
check("the API without a token -> 401 JSON", apiNone.status === 401 && apiNone.body.includes("unauthorized"), `${apiNone.status}`);

const john = await cookieFor("john@johnmorris.ca");
const dash = await get(`${BASE}/`, { cookie: john });
check("the admin's cookie opens / with the device and the toolbar", dash.status === 200 && dash.body.includes("e2e-secret-device-7") && dash.body.includes("john@johnmorris.ca"), `${dash.status}`);
const pkg = await get(`${BASE}/packages`, { cookie: john });
check("the admin's cookie opens /packages", pkg.status === 200 && pkg.body.includes("kazoku-ui"), `${pkg.status}`);
const providers = await get(`${BASE}/api/auth/providers`);
check("next-auth answers signed out (the sign-in is reachable)", providers.status === 200 && providers.body.includes('"google"'), `${providers.status}`);
const robots = await get(`${BASE}/robots.txt`);
check("/robots.txt disallows everything", robots.status === 200 && robots.body.includes("Disallow: /"));

console.log(`\nprod: ${passed} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
