import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

export const SOURCE_TYPES = ["app", "server", "job", "deploy", "device", "service"] as const;

const jsonObjectSchema = z.record(z.string(), z.unknown());

export const canonicalTelemetryEventSchema = z.object({
  api_version: z.literal("v1").optional(),
  project_key: z.string().min(1).max(128).optional(),
  source_type: z.enum(SOURCE_TYPES).default("app"),
  source_id: z.string().min(1).max(128),
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

export type CanonicalTelemetryEventPayload = z.infer<typeof canonicalTelemetryEventSchema>;

export const legacyAppTelemetrySchema = z.object({
  project_key: z.string().min(1).max(128).optional(),
  source_type: z.enum(SOURCE_TYPES).optional(),
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

export type LegacyAppTelemetryPayload = z.infer<typeof legacyAppTelemetrySchema>;

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

export function legacyAppPayloadToCanonical(payload: LegacyAppTelemetryPayload): CanonicalTelemetryEventPayload {
  return {
    ...payload,
    api_version: "v1",
    source_type: payload.source_type || "app",
    source_id: payload.app_id,
  };
}

export async function ingestTelemetryEvent(payload: CanonicalTelemetryEventPayload, rawBody: Record<string, unknown>) {
  const projectKey = payload.project_key || process.env.DEFAULT_PROJECT_KEY || "default";
  const sourceType = payload.source_type || "app";
  const environment = payload.environment || "default";
  const now = new Date();
  const occurredAt = parseOccurredAt(payload.occurred_at);

  const source = await prisma.appTelemetrySource.upsert({
    where: {
      projectKey_sourceType_appId_environment: {
        projectKey,
        sourceType,
        appId: payload.source_id,
        environment,
      },
    },
    update: {
      displayName: payload.display_name,
      host: payload.host,
      service: payload.service,
      lastEvent: payload.event,
      lastStatus: payload.status,
      lastSeverity: payload.severity,
      lastMessage: payload.message,
      lastSeenAt: now,
    },
    create: {
      projectKey,
      sourceType,
      appId: payload.source_id,
      displayName: payload.display_name,
      environment,
      host: payload.host,
      service: payload.service,
      lastEvent: payload.event,
      lastStatus: payload.status,
      lastSeverity: payload.severity,
      lastMessage: payload.message,
      lastSeenAt: now,
    },
  });

  await prisma.appTelemetryEvent.create({
    data: {
      projectKey,
      sourceType,
      appId: payload.source_id,
      sourceRefId: source.id,
      environment,
      host: payload.host,
      service: payload.service,
      event: payload.event,
      status: payload.status,
      severity: payload.severity,
      message: payload.message,
      durationMs: payload.duration_ms,
      metricName: payload.metric_name,
      metricValue: payload.metric_value,
      metricUnit: payload.metric_unit,
      tags: jsonOrUndefined(payload.tags),
      metrics: jsonOrUndefined(payload.metrics),
      server: jsonOrUndefined(payload.server),
      telemetry: jsonOrUndefined(payload.telemetry),
      raw: jsonOrUndefined({
        ...rawBody,
        api_version: "v1",
        project_key: projectKey,
        source_type: sourceType,
        source_id: payload.source_id,
        environment,
      }),
      occurredAt,
    },
  });

  return {
    projectKey,
    sourceType,
    sourceId: payload.source_id,
    environment,
  };
}
