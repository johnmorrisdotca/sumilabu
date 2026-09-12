import { NextRequest, NextResponse } from "next/server";

import { isResponse, requireCaller } from "@/lib/board/http";
import { listSettings } from "@/lib/board/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectKey: string }> };

/** Every setting for a project, as one object a client can cache whole. */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { projectKey } = await ctx.params;
  const caller = requireCaller(req, projectKey, false);
  if (isResponse(caller)) return caller;
  return NextResponse.json({ ok: true, api_version: "v1", settings: await listSettings(projectKey) });
}
