import { DiagConsoleLogger, DiagLogLevel, diag } from "@opentelemetry/api";

import { registerOTel } from "@vercel/otel";
import { env } from "./env";

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR); // set diaglog level to DEBUG when debugging

export async function register() {
  // No endpoint, no exporter. Without one the OTLP exporter posts to
  // http://localhost:4318, where nothing listens inside the container, and
  // every batch logs ECONNREFUSED (production on 2026-10-13: no endpoint set).
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT) return;
  // "auto" builds the exporter from the standard variables:
  // <OTEL_EXPORTER_OTLP_ENDPOINT>/v1/traces over HTTP/protobuf, sending
  // OTEL_EXPORTER_OTLP_HEADERS (the hosted collector's basic auth). An
  // exporter of our own alongside an endpoint variable made @vercel/otel
  // register both, so every span went out twice, once without the headers.
  registerOTel({
    serviceName: env.OTEL_SERVICE_NAME,
    traceExporter: "auto",
  });
}
