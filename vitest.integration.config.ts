/**
 * Shared Vitest base for integration / e2e runs (MDRS-20).
 *
 * The inherited `test/jest-e2e.json` files set neither a timeout nor a worker
 * cap, so four suites each booting their own Testcontainers `postgres:17-alpine`
 * raced and blew Jest's 5 s default hook limit. Vitest splits Jest's single
 * `testTimeout` into `testTimeout` / `hookTimeout` / `teardownTimeout`, and the
 * container boot happens in a `beforeAll` — i.e. under `hookTimeout`, whose
 * default is 10 s. All three are set here on purpose; a container timeout is a
 * configuration bug, never flake.
 */
import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      testTimeout: 120_000,
      // Container pull + boot + drizzle migrations all run here.
      hookTimeout: 180_000,
      teardownTimeout: 60_000,
      // One container at a time: parallel suites each start their own postgres,
      // and on a cold image cache the contention is what caused the timeouts.
      //
      // Vitest 4 removed `poolOptions` — `poolOptions.forks.singleFork` is now
      // only logged as deprecated and otherwise ignored, so writing it would
      // have left the suites running in parallel while looking configured.
      // `fileParallelism: false` is the replacement and forces `maxWorkers` to
      // 1; both are stated so neither can be dropped by accident.
      pool: "forks",
      fileParallelism: false,
      maxWorkers: 1,
      // A separate file so an e2e run never clobbers the unit run's report.
      outputFile: { junit: "./coverage/junit-e2e.xml" },
      // Coverage thresholds are gated by the `test` target, which runs every
      // spec. Measuring a subset here would report a false shortfall.
      coverage: { enabled: false },
    },
  })
);
