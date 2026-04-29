import { NextResponse } from "next/server";

export const runtime = "nodejs";

type OpenApiSchema = Record<string, unknown>;

const appTelemetryPayload: OpenApiSchema = {
  type: "object",
  required: ["app_id", "event"],
  additionalProperties: true,
  properties: {
    project_key: { type: "string", description: "Product/project partition, for example inkyframe or onibako. Defaults to DEFAULT_PROJECT_KEY." },
    app_id: { type: "string", description: "Stable application identifier, for example onibako." },
    display_name: { type: "string", description: "Human readable app or product name." },
    environment: { type: "string", description: "Runtime environment, server name, stage, or deployment target. Defaults to default." },
    host: { type: "string", description: "Hostname, IP, or machine identity." },
    service: { type: "string", description: "Service or subsystem emitting the event." },
    event: { type: "string", description: "Event name such as deploy, health_check, job_complete, or error." },
    status: { type: "string", description: "Short status such as ok, failed, warning, or degraded." },
    severity: { type: "string", description: "Severity such as info, warn, error, critical." },
    message: { type: "string", description: "Human readable event summary." },
    duration_ms: { type: "integer", minimum: 0, description: "Duration in milliseconds." },
    metric_name: { type: "string", description: "Primary metric name for simple emitters." },
    metric_value: { type: "number", description: "Primary metric value for simple emitters." },
    metric_unit: { type: "string", description: "Primary metric unit such as seconds, ms, count, bytes." },
    tags: { type: "object", additionalProperties: true },
    metrics: { type: "object", additionalProperties: true },
    server: { type: "object", additionalProperties: true },
    telemetry: { type: "object", additionalProperties: true },
    occurred_at: {
      oneOf: [
        { type: "string", format: "date-time" },
        { type: "integer", minimum: 0, description: "Unix seconds or milliseconds." },
      ],
    },
  },
  example: {
    project_key: "onibako",
    app_id: "onibako",
    display_name: "Onibako",
    environment: "ds15",
    host: "10.0.0.161",
    service: "compose",
    event: "deploy",
    status: "ok",
    severity: "info",
    message: "Remote deploy completed",
    duration_ms: 77000,
    metric_name: "remote_deploy",
    metric_value: 77,
    metric_unit: "seconds",
    tags: {},
    metrics: {},
    server: {},
    telemetry: {},
  },
};

const deviceStatsPayload: OpenApiSchema = {
  type: "object",
  required: ["event", "device_id"],
  additionalProperties: false,
  properties: {
    project_key: { type: "string", description: "Product/project partition. Defaults to DEFAULT_PROJECT_KEY." },
    event: { type: "string", description: "Device event such as boot, mode_change, refresh, heartbeat." },
    device_id: { type: "string", description: "Stable hardware/firmware device identifier." },
    app_version: { type: "string" },
    mode: { type: "string" },
    ntp_ok: { type: "boolean" },
    bitmap_assets_ok: { type: "boolean" },
    mem_free: { type: "integer", minimum: 0 },
    mem_alloc: { type: "integer", minimum: 0 },
    uptime_s: { type: "integer", minimum: 0 },
    unix_ts: { type: "integer", minimum: 0 },
    wifi: { type: "string" },
    sync: { type: "string" },
    error_log: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        properties: {
          ts: { type: "number" },
          ctx: { type: "string" },
          err: { type: "string" },
          mem: { type: "number" },
          up: { type: "number" },
        },
      },
    },
  },
};

const okResponse: OpenApiSchema = {
  description: "Ingest accepted.",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: { ok: { type: "boolean", const: true } },
      },
    },
  },
};

const errorResponse: OpenApiSchema = {
  description: "Request rejected.",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          ok: { type: "boolean", const: false },
          error: { type: "string" },
          details: { type: "array" },
        },
      },
    },
  },
};

const spec = {
  openapi: "3.1.0",
  info: {
    title: "SumiLabu Telemetry API",
    version: "1.0.0",
    description: "Contracts for product telemetry ingest. Hardware/firmware devices use /api/device-stats. Apps, servers, jobs, and sibling projects use /api/app-telemetry.",
  },
  servers: [{ url: "https://app.sumilabu.com", description: "Production" }],
  tags: [
    { name: "App telemetry", description: "Generic app/server telemetry for products such as Onibako." },
    { name: "Device telemetry", description: "Hardware/firmware telemetry for devices such as SumiLabu Clock." },
    { name: "Contracts", description: "Machine-readable API contracts for sibling projects." },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "Use the per-project token from PROJECT_TOKENS_JSON when configured, otherwise INGEST_API_TOKEN.",
      },
    },
    schemas: {
      AppTelemetryPayload: appTelemetryPayload,
      DeviceStatsPayload: deviceStatsPayload,
    },
  },
  paths: {
    "/api/app-telemetry": {
      post: {
        tags: ["App telemetry"],
        summary: "Ingest generic app/server telemetry",
        description: "Use this endpoint for sibling products, backend services, deployments, jobs, health checks, and other non-microcontroller telemetry.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AppTelemetryPayload" },
            },
          },
        },
        responses: {
          "200": okResponse,
          "400": errorResponse,
          "401": errorResponse,
        },
      },
    },
    "/api/device-stats": {
      post: {
        tags: ["Device telemetry"],
        summary: "Ingest hardware/firmware device telemetry",
        description: "Use this endpoint for microcontroller and firmware devices such as SumiLabu Clock / InkyFrame.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/DeviceStatsPayload" },
            },
          },
        },
        responses: {
          "200": okResponse,
          "400": errorResponse,
          "401": errorResponse,
        },
      },
    },
    "/api/openapi": {
      get: {
        tags: ["Contracts"],
        summary: "Fetch the OpenAPI contract",
        responses: {
          "200": {
            description: "OpenAPI 3.1 JSON document.",
            content: { "application/json": { schema: { type: "object" } } },
          },
        },
      },
    },
  },
};

export async function GET() {
  return NextResponse.json(spec, {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}
