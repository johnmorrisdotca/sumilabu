import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { TOKEN_SCOPES } from "@/lib/board/auth";
import { isResponse, readJson, requireCaller } from "@/lib/board/http";
import { SETTING_LIMITS, isSettingKey } from "@/lib/board/rules";
import { deleteSetting, getSetting, setSetting } from "@/lib/board/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectKey: string; key: string }> };

const invalidKey = () => NextResponse.json({ ok: false, error: "invalid_key" }, { status: 400 });

export async function GET(req: NextRequest, ctx: Ctx) {
  const { projectKey, key } = await ctx.params;
  const caller = requireCaller(req, projectKey, false, TOKEN_SCOPES.settings);
  if (isResponse(caller)) return caller;
  if (!isSettingKey(key)) return invalidKey();
  const setting = await getSetting(projectKey, key);
  return setting === null
    ? NextResponse.json({ ok: false, error: "missing" }, { status: 404 })
    : NextResponse.json({ ok: true, ...setting });
}

const putSchema = z.object({ value: z.string().max(SETTING_LIMITS.value) });

/** A write names who made it; `setBy` is the log that answers "who changed this". */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const { projectKey, key } = await ctx.params;
  const caller = requireCaller(req, projectKey, true, TOKEN_SCOPES.settings);
  if (isResponse(caller)) return caller;
  if (!isSettingKey(key)) return invalidKey();
  const parsed = putSchema.safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 });
  const setting = await setSetting(projectKey, key, parsed.data.value, caller.actor!);
  return NextResponse.json({ ok: true, ...setting });
}

/**
 * Back to the default. A client reads "no row" as its built-in value, so
 * clearing is a delete rather than an empty string - one representation of
 * "unset", not two. Deleting what is not there is not an error.
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { projectKey, key } = await ctx.params;
  const caller = requireCaller(req, projectKey, true, TOKEN_SCOPES.settings);
  if (isResponse(caller)) return caller;
  if (!isSettingKey(key)) return invalidKey();
  const deleted = await deleteSetting(projectKey, key);
  return NextResponse.json({ ok: true, key, deleted });
}
