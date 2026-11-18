/**
 * The OTel exporter is registered only when an endpoint is configured. Without
 * one it would post every batch to http://localhost:4318 inside the container
 * and log ECONNREFUSED, which is what production did on 2026-10-13.
 *
 * With one, @vercel/otel builds the single exporter from the standard
 * OTEL_EXPORTER_OTLP_* variables, headers included. Passing an exporter of our
 * own as well made it register two, one of them without the collector's auth.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerOTel: vi.fn(),
  env: {} as {
    OTEL_EXPORTER_OTLP_ENDPOINT?: string;
    OTEL_SERVICE_NAME?: string;
  },
}));

vi.mock("@vercel/otel", () => ({ registerOTel: mocks.registerOTel }));
vi.mock("../env", () => ({ env: mocks.env }));

import { register } from "../instrumentation";

describe("instrumentation register()", () => {
  beforeEach(() => {
    mocks.registerOTel.mockClear();
    delete mocks.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    mocks.env.OTEL_SERVICE_NAME = "web-under-test";
  });

  it("registers nothing without an endpoint", async () => {
    await register();
    expect(mocks.registerOTel).not.toHaveBeenCalled();
  });

  it("registers one env-built exporter when an endpoint is set", async () => {
    mocks.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://collector.example";
    await register();
    expect(mocks.registerOTel).toHaveBeenCalledTimes(1);
    expect(mocks.registerOTel).toHaveBeenCalledWith({
      serviceName: "web-under-test",
      traceExporter: "auto",
    });
  });
});
