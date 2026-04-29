import { NextRequest } from "next/server";

export function parseProjectTokens(): Record<string, string> {
  const raw = process.env.PROJECT_TOKENS_JSON;
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed || {};
  } catch {
    return {};
  }
}

export function isAuthorizedIngest(req: NextRequest, projectKey: string): boolean {
  const projectTokens = parseProjectTokens();
  const projectToken = projectTokens[projectKey];
  const fallbackToken = process.env.INGEST_API_TOKEN;
  const configuredToken = projectToken || fallbackToken;

  if (!configuredToken) {
    return true;
  }

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) {
    return false;
  }

  const token = auth.slice("Bearer ".length).trim();
  return token === configuredToken;
}
