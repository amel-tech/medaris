import { DiagConsoleLogger, DiagLogLevel, diag } from "@opentelemetry/api";

import { OTLPHttpJsonTraceExporter, registerOTel } from "@vercel/otel";
import { env } from "./env";

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR); // set diaglog level to DEBUG when debugging

export async function register() {
  // No endpoint, no exporter. Without one the OTLP exporter posts to
  // http://localhost:4318, where nothing listens inside the container, and
  // every batch logs ECONNREFUSED (production on 2026-10-13: no endpoint set).
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT) return;
  registerOTel({
    serviceName: env.OTEL_SERVICE_NAME,
    traceExporter: new OTLPHttpJsonTraceExporter({
      url: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    }),
  });
}
