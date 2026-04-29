import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isAuthorizedIngest } from "@/lib/ingest-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const payloadSchema = z.object({
  project_key: z.string().min(1).max(128).optional(),
  event: z.string().min(1).max(64),
  device_id: z.string().min(1).max(128),
  app_version: z.string().max(64).optional(),
  mode: z.string().max(16).optional(),
  ntp_ok: z.boolean().optional(),
  bitmap_assets_ok: z.boolean().optional(),
  mem_free: z.number().int().nonnegative().optional(),
  mem_alloc: z.number().int().nonnegative().optional(),
  uptime_s: z.number().int().nonnegative().optional(),
  unix_ts: z.number().int().nonnegative().optional(),
  wifi: z.string().max(256).optional(),
  sync: z.string().max(256).optional(),
  error_log: z.array(z.object({
    ts: z.number().optional(),
    ctx: z.string().optional(),
    err: z.string().optional(),
    mem: z.number().optional(),
    up: z.number().optional(),
  })).max(20).optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_payload", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const p = parsed.data;
  const projectKey = p.project_key || process.env.DEFAULT_PROJECT_KEY || "default";

  if (!isAuthorizedIngest(req, projectKey)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const device = await prisma.device.upsert({
    where: {
      projectKey_deviceId: {
        projectKey,
        deviceId: p.device_id,
      },
    },
    update: {
      appVersion: p.app_version,
      lastMode: p.mode,
      lastSeenAt: now,
    },
    create: {
      projectKey,
      deviceId: p.device_id,
      appVersion: p.app_version,
      lastMode: p.mode,
      lastSeenAt: now,
    },
  });

  await prisma.deviceEvent.create({
    data: {
      projectKey,
      deviceId: p.device_id,
      deviceRefId: device.id,
      event: p.event,
      mode: p.mode,
      ntpOk: p.ntp_ok,
      bitmapAssetsOk: p.bitmap_assets_ok,
      memFree: p.mem_free,
      memAlloc: p.mem_alloc,
      uptimeS: p.uptime_s,
      unixTs: p.unix_ts,
      wifi: p.wifi,
      sync: p.sync,
      appVersion: p.app_version,
      raw: {
        ...p,
        project_key: projectKey,
      },
    },
  });

  return NextResponse.json({ ok: true });
}
