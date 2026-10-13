/**
 * The OTel exporter is registered only when an endpoint is configured. Without
 * one it would post every batch to http://localhost:4318 inside the container
 * and log ECONNREFUSED, which is what production did on 2026-10-13.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerOTel: vi.fn(),
  exporterUrls: [] as (string | undefined)[],
  env: {} as {
    OTEL_EXPORTER_OTLP_ENDPOINT?: string;
    OTEL_SERVICE_NAME?: string;
  },
}));

vi.mock("@vercel/otel", () => ({
  registerOTel: mocks.registerOTel,
  OTLPHttpJsonTraceExporter: class {
    constructor(options: { url?: string }) {
      mocks.exporterUrls.push(options.url);
    }
  },
}));
vi.mock("../env", () => ({ env: mocks.env }));

import { register } from "../instrumentation";

describe("instrumentation register()", () => {
  beforeEach(() => {
    mocks.registerOTel.mockClear();
    mocks.exporterUrls.length = 0;
    delete mocks.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  });

  it("registers nothing without an endpoint", async () => {
    await register();
    expect(mocks.registerOTel).not.toHaveBeenCalled();
    expect(mocks.exporterUrls).toEqual([]);
  });

  it("exports to the configured endpoint", async () => {
    mocks.env.OTEL_EXPORTER_OTLP_ENDPOINT =
      "https://collector.example/v1/traces";
    await register();
    expect(mocks.registerOTel).toHaveBeenCalledTimes(1);
    expect(mocks.exporterUrls).toEqual(["https://collector.example/v1/traces"]);
  });
});
