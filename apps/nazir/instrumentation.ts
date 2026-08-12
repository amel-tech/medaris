import { DiagConsoleLogger, DiagLogLevel, diag } from "@opentelemetry/api";

import { OTLPHttpJsonTraceExporter, registerOTel } from "@vercel/otel";
import { env } from "./env";

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR); // set diaglog level to DEBUG when debugging

export async function register() {
  registerOTel({
    serviceName: env.OTEL_SERVICE_NAME,
    traceExporter: new OTLPHttpJsonTraceExporter({
      url: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    }),
  });
}
