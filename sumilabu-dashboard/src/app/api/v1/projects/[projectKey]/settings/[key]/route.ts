import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isResponse, readJson, requireCaller } from "@/lib/board/http";
import { getSetting, setSetting } from "@/lib/board/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectKey: string; key: string }> };

const KEY = /^[a-z0-9_.-]{1,80}$/;

export async function GET(req: NextRequest, ctx: Ctx) {
  const { projectKey, key } = await ctx.params;
  const caller = requireCaller(req, projectKey, false);
  if (isResponse(caller)) return caller;
  if (!KEY.test(key)) return NextResponse.json({ ok: false, error: "invalid_key" }, { status: 400 });
  const value = await getSetting(projectKey, key);
  return value === null
    ? NextResponse.json({ ok: false, error: "missing" }, { status: 404 })
    : NextResponse.json({ ok: true, key, value });
}

const putSchema = z.object({ value: z.string().max(4000) });

/** A write names who made it; `setBy` is the log that answers "who changed this". */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const { projectKey, key } = await ctx.params;
  const caller = requireCaller(req, projectKey, true);
  if (isResponse(caller)) return caller;
  if (!KEY.test(key)) return NextResponse.json({ ok: false, error: "invalid_key" }, { status: 400 });
  const parsed = putSchema.safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 });
  await setSetting(projectKey, key, parsed.data.value, caller.actor!);
  return NextResponse.json({ ok: true, key, value: parsed.data.value });
}
