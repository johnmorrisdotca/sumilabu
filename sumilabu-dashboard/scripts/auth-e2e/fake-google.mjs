#!/usr/bin/env node
/*
 * A stand-in for accounts.google.com, for the local end-to-end run of the
 * sign-in (scripts/auth-e2e/run.sh). It speaks just enough OpenID Connect
 * for next-auth's Google provider: discovery, an authorization endpoint that
 * answers at once (no login screen) as whoever was last set on
 * `POST /__identity`, a token endpoint that checks the client, the redirect
 * address and the PKCE verifier, and the signing keys. The ID token is a real
 * RS256 JWT, so next-auth checks its signature, issuer, audience and expiry
 * exactly as it would Google's.
 *
 * Loopback only. The site reads it only when NODE_ENV is development or test
 * (SUMILABU_GOOGLE_TEST_ISSUER, lib/auth/options.ts).
 *
 *   node scripts/auth-e2e/fake-google.mjs <port> <client id> <client secret> <redirect uri>
 */
import { createHash, createSign, generateKeyPairSync, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const [port, clientId, clientSecret, redirectUri] = process.argv.slice(2);
if (!port || !clientId || !clientSecret || !redirectUri) {
  console.error("usage: fake-google.mjs <port> <client id> <client secret> <redirect uri>");
  process.exit(2);
}
const issuer = `http://127.0.0.1:${port}`;
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const kid = randomBytes(8).toString("hex");
const jwk = { ...publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" };

let identity = { email: "john@spxis.com", email_verified: true, name: "John Morris", sub: "100000000000000000001" };
const codes = new Map();

const b64url = (input) => Buffer.from(input).toString("base64url");

function idToken(claims) {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid }));
  const payload = b64url(JSON.stringify(claims));
  const signature = createSign("RSA-SHA256").update(`${header}.${payload}`).sign(privateKey).toString("base64url");
  return `${header}.${payload}.${signature}`;
}

function send(res, status, body, headers = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": typeof body === "string" ? "text/plain" : "application/json", "Cache-Control": "no-store", ...headers });
  res.end(text);
}

async function readBody(req) {
  let text = "";
  for await (const chunk of req) text += chunk;
  return text;
}

/** client_secret_basic (what next-auth sends) or client_secret_post. */
function clientOk(req, form) {
  const auth = req.headers.authorization ?? "";
  if (auth.startsWith("Basic ")) {
    const [id, secret] = Buffer.from(auth.slice(6), "base64").toString().split(":").map(decodeURIComponent);
    return id === clientId && secret === clientSecret;
  }
  return form.get("client_id") === clientId && form.get("client_secret") === clientSecret;
}

createServer(async (req, res) => {
  const url = new URL(req.url, issuer);
  console.log(`fake-google ${req.method} ${url.pathname}`);
  try {
    if (req.method === "GET" && url.pathname === "/.well-known/openid-configuration") {
      return send(res, 200, {
        issuer,
        authorization_endpoint: `${issuer}/o/oauth2/v2/auth`,
        token_endpoint: `${issuer}/token`,
        userinfo_endpoint: `${issuer}/userinfo`,
        jwks_uri: `${issuer}/certs`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
      });
    }
    if (req.method === "GET" && url.pathname === "/certs") return send(res, 200, { keys: [jwk] });
    if (req.method === "POST" && url.pathname === "/__identity") {
      identity = { sub: "100000000000000000001", name: "Test Person", ...JSON.parse(await readBody(req)) };
      return send(res, 200, { ok: true });
    }
    if (req.method === "GET" && url.pathname === "/o/oauth2/v2/auth") {
      const p = url.searchParams;
      if (p.get("client_id") !== clientId) return send(res, 400, "unknown client");
      if (p.get("redirect_uri") !== redirectUri) return send(res, 400, `redirect_uri_mismatch: ${p.get("redirect_uri")}`);
      if (p.get("response_type") !== "code" || p.get("code_challenge_method") !== "S256" || !p.get("code_challenge") || !p.get("state")) return send(res, 400, "bad request");
      if (!(p.get("scope") ?? "").split(" ").includes("openid")) return send(res, 400, "no openid scope");
      const code = randomBytes(16).toString("hex");
      codes.set(code, { identity, challenge: p.get("code_challenge"), nonce: p.get("nonce") });
      const back = new URL(redirectUri);
      back.searchParams.set("code", code);
      back.searchParams.set("state", p.get("state"));
      res.writeHead(302, { Location: back.toString() });
      return res.end();
    }
    if (req.method === "POST" && url.pathname === "/token") {
      const form = new URLSearchParams(await readBody(req));
      if (!clientOk(req, form)) return send(res, 401, { error: "invalid_client" });
      const grant = codes.get(form.get("code"));
      codes.delete(form.get("code"));
      if (!grant || form.get("grant_type") !== "authorization_code" || form.get("redirect_uri") !== redirectUri) return send(res, 400, { error: "invalid_grant" });
      const verifier = form.get("code_verifier") ?? "";
      if (createHash("sha256").update(verifier).digest("base64url") !== grant.challenge) return send(res, 400, { error: "invalid_grant", error_description: "pkce" });
      const now = Math.floor(Date.now() / 1000);
      const claims = { iss: issuer, aud: clientId, azp: clientId, iat: now, exp: now + 3600, ...grant.identity, ...(grant.nonce ? { nonce: grant.nonce } : {}) };
      return send(res, 200, { access_token: randomBytes(16).toString("hex"), token_type: "Bearer", expires_in: 3600, scope: "openid email profile", id_token: idToken(claims) });
    }
    return send(res, 404, "not found");
  } catch (error) {
    console.error(error);
    return send(res, 500, "error");
  }
}).listen(Number(port), "127.0.0.1", () => console.log(`fake-google listening on ${issuer}`));
