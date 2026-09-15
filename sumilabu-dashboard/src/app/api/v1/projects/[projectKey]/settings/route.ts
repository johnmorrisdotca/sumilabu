import { NextRequest, NextResponse } from "next/server";

import { TOKEN_SCOPES } from "@/lib/board/auth";
import { isResponse, requireCaller } from "@/lib/board/http";
import { listSettings } from "@/lib/board/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectKey: string }> };

/**
 * Every setting for a project: `settings` is the `{ key: value }` map a
 * client caches whole, and `entries` carries who set each one and when.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { projectKey } = await ctx.params;
  const caller = requireCaller(req, projectKey, false, TOKEN_SCOPES.settings);
  if (isResponse(caller)) return caller;
  const entries = await listSettings(projectKey);
  const settings = Object.fromEntries(entries.map((entry) => [entry.key, entry.value]));
  return NextResponse.json({ ok: true, api_version: "v1", settings, entries });
}
