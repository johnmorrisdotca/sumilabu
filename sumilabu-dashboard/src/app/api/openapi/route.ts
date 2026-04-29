import { NextResponse } from "next/server";

export const runtime = "nodejs";

type OpenApiSchema = Record<string, unknown>;

const canonicalTelemetryPayload: OpenApiSchema = {
  type: "object",
  required: ["source_id", "source_type", "event"],
  additionalProperties: true,
  properties: {
    api_version: { type: "string", const: "v1", description: "Optional explicit contract version. The path version is authoritative." },
    project_key: { type: "string", description: "Product/project partition, for example inkyframe or onibako. Defaults to DEFAULT_PROJECT_KEY." },
    source_type: { type: "string", enum: ["app", "server", "job", "deploy", "device", "service"], description: "Kind of producer sending telemetry." },
    source_id: { type: "string", description: "Stable producer identifier, for example onibako, ds15, deploy-script, or clock-01." },
    display_name: { type: "string", description: "Human readable source or product name." },
    environment: { type: "string", description: "Runtime environment, server name, stage, or deployment target. Defaults to default." },
    host: { type: "string", description: "Hostname, IP, or machine identity." },
    service: { type: "string", description: "Service or subsystem emitting the event." },
    event: { type: "string", description: "Event name such as deploy, heartbeat, health_check, job_complete, or error." },
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
    api_version: "v1",
    project_key: "onibako",
    source_type: "app",
    source_id: "onibako",
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

const appTelemetryPayload: OpenApiSchema = {
  type: "object",
  required: ["app_id", "event"],
  additionalProperties: true,
  properties: {
    source_type: { type: "string", enum: ["app", "server", "job", "deploy", "device", "service"], description: "Optional source type. Defaults to app for compatibility." },
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
    version: "1.1.0",
    description: "Contracts for product telemetry ingest. New integrations should use the canonical versioned /api/v1/telemetry/events endpoint. Older firmware can continue to use /api/device-stats, and /api/app-telemetry remains as a compatibility alias.",
  },
  servers: [{ url: "https://app.sumilabu.com", description: "Production" }],
  tags: [
    { name: "Canonical telemetry", description: "Preferred versioned telemetry API for new sibling projects." },
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
      TelemetryEventV1Payload: canonicalTelemetryPayload,
      AppTelemetryPayload: appTelemetryPayload,
      DeviceStatsPayload: deviceStatsPayload,
    },
  },
  paths: {
    "/api/v1/telemetry/events": {
      post: {
        tags: ["Canonical telemetry"],
        summary: "Ingest a v1 telemetry event",
        description: "Preferred endpoint for new product integrations. Use source_type and source_id so apps, servers, jobs, deploy scripts, services, and future devices all follow one guessable contract.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TelemetryEventV1Payload" },
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
    "/api/app-telemetry": {
      post: {
        tags: ["App telemetry"],
        summary: "Compatibility ingest for generic app/server telemetry",
        description: "Compatibility endpoint. New integrations should prefer /api/v1/telemetry/events.",
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
        description: "Legacy endpoint for existing microcontroller and firmware devices such as SumiLabu Clock / InkyFrame. Keep using it for installed firmware; new producers should prefer /api/v1/telemetry/events.",
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
    "/api/openapi.json": {
      get: {
        tags: ["Contracts"],
        summary: "Fetch the OpenAPI contract as JSON",
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
