import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import process from "process";
import * as pkg from "../package.json";

// Read straight from process.env, not through `configuration()`. The config
// factory imports `@medaris/common`, whose barrel loads pino, winston and
// @nestjs/core; anything required before `sdk.start()` below sits in the
// require cache unpatched, so those instrumentations would silently record
// nothing. `@medaris/common` must first be required from main.ts, after this
// file has run (MDRS-85 review). The defaults mirror config/config.ts.
const enabled = process.env.OTEL_ENABLED === "true";
const serviceName = process.env.SERVICE_NAME || pkg.name;
const environment = process.env.NODE_ENV || "development";
const version = pkg.version || "0.0.1";

if (enabled) {
  const traceExporter = new OTLPTraceExporter();

  const sdk = new NodeSDK({
    traceExporter,
    instrumentations: [getNodeAutoInstrumentations()],
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      "service.version": version,
      "deployment.environment": environment,
    }),
  });

  // initialize the SDK and register with the OpenTelemetry API
  // this enables the API to record telemetry
  sdk.start();
  console.log(`OpenTelemetry SDK started for service: ${serviceName}`);

  // gracefully shut down the SDK on process exit
  process.on("SIGTERM", () => {
    sdk
      .shutdown()
      .then(() => console.log("Tracing terminated"))
      .catch((error) => console.log("Error terminating tracing", error))
      .finally(() => process.exit(0));
  });
} else {
  console.log("OpenTelemetry is disabled. Skipping initialization.");
}
