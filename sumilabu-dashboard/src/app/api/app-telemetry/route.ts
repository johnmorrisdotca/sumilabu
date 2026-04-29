import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isAuthorizedIngest } from "@/lib/ingest-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const jsonObjectSchema = z.record(z.string(), z.unknown());

const payloadSchema = z.object({
  project_key: z.string().min(1).max(128).optional(),
  app_id: z.string().min(1).max(128),
  display_name: z.string().min(1).max(160).optional(),
  environment: z.string().min(1).max(80).optional(),
  host: z.string().max(256).optional(),
  service: z.string().max(128).optional(),
  event: z.string().min(1).max(128),
  status: z.string().max(64).optional(),
  severity: z.string().max(64).optional(),
  message: z.string().max(4096).optional(),
  duration_ms: z.number().int().nonnegative().optional(),
  metric_name: z.string().max(128).optional(),
  metric_value: z.number().optional(),
  metric_unit: z.string().max(64).optional(),
  tags: jsonObjectSchema.optional(),
  metrics: jsonObjectSchema.optional(),
  server: jsonObjectSchema.optional(),
  telemetry: jsonObjectSchema.optional(),
  occurred_at: z.union([z.string().datetime(), z.number().int().nonnegative()]).optional(),
}).passthrough();

function parseOccurredAt(value?: string | number): Date | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "number") {
    return new Date(value < 10_000_000_000 ? value * 1000 : value);
  }

  return new Date(value);
}

function jsonOrUndefined(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value as Prisma.InputJsonValue;
}

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
  const environment = p.environment || "default";

  if (!isAuthorizedIngest(req, projectKey)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const occurredAt = parseOccurredAt(p.occurred_at);

  const source = await prisma.appTelemetrySource.upsert({
    where: {
      projectKey_appId_environment: {
        projectKey,
        appId: p.app_id,
        environment,
      },
    },
    update: {
      displayName: p.display_name,
      host: p.host,
      service: p.service,
      lastEvent: p.event,
      lastStatus: p.status,
      lastSeverity: p.severity,
      lastMessage: p.message,
      lastSeenAt: now,
    },
    create: {
      projectKey,
      appId: p.app_id,
      displayName: p.display_name,
      environment,
      host: p.host,
      service: p.service,
      lastEvent: p.event,
      lastStatus: p.status,
      lastSeverity: p.severity,
      lastMessage: p.message,
      lastSeenAt: now,
    },
  });

  await prisma.appTelemetryEvent.create({
    data: {
      projectKey,
      appId: p.app_id,
      sourceRefId: source.id,
      environment,
      host: p.host,
      service: p.service,
      event: p.event,
      status: p.status,
      severity: p.severity,
      message: p.message,
      durationMs: p.duration_ms,
      metricName: p.metric_name,
      metricValue: p.metric_value,
      metricUnit: p.metric_unit,
      tags: jsonOrUndefined(p.tags),
      metrics: jsonOrUndefined(p.metrics),
      server: jsonOrUndefined(p.server),
      telemetry: jsonOrUndefined(p.telemetry),
      raw: jsonOrUndefined({
        ...(body as Record<string, unknown>),
        project_key: projectKey,
        app_id: p.app_id,
        environment,
      }),
      occurredAt,
    },
  });

  return NextResponse.json({ ok: true });
}
