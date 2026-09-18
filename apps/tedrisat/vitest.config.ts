/**
 * tedrisat — Vitest config for the `test` target (MDRS-20).
 *
 * Replaces `jest.config.json`. The spec selection below is the exact pair of
 * globs that file matched, which is why the `test/e2e/*.e2e.spec.ts` suites
 * still run under `nx run tedrisat:test`: they were never e2e-only.
 */
import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig, { nestSwcPlugin } from "../../vitest.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [nestSwcPlugin()],
    test: {
      root: __dirname,
      // Verbatim from jest.config.json `testMatch`.
      include: ["test/**/*.spec.ts", "src/**/*.spec.ts"],
      exclude: ["node_modules/**", "dist/**"],
      // The one `postgres:17-alpine` this run gets (MDRS-84). Before it, the
      // container lived in a module-level singleton in
      // test/helpers/test-app.helper.ts, which `pool: "forks"` below made
      // per-file rather than per-run: 8 e2e suites, 8 container boots.
      // `globalSetup` runs once in the main process and hands the workers the
      // connection details through `provide`/`inject`.
      globalSetup: ["./test/global-setup.ts"],
      // jest.config.json set `testTimeout: 60000` and `maxWorkers: 1`. Jest
      // applied that timeout to hooks too; Vitest does not. The Testcontainers
      // boot has moved to `globalSetup`, which is governed by neither of these
      // — but `createTestApp` still creates a database and runs the migrations
      // from a `beforeAll`, so `hookTimeout` stays generous.
      testTimeout: 60_000,
      hookTimeout: 180_000,
      teardownTimeout: 60_000,
      // jest.config.json's `maxWorkers: 1`. Vitest 4 removed `poolOptions`, so
      // `singleFork` would be silently ignored; `fileParallelism: false` is the
      // option that actually serialises, and it forces `maxWorkers` to 1.
      //
      // MDRS-84 removed the original reason for it — suites no longer race for
      // the Docker daemon, because there is only one container and `globalSetup`
      // has already started it before any worker runs. It stays serial on
      // purpose all the same: each e2e file boots one or two full Nest
      // applications with their own pg pools, and letting eight files do that
      // at once would point a multiple of those connections at one postgres
      // whose `max_connections` nobody has sized. Turning it on is its own
      // change, with its own measurement.
      //
      // `pool: "forks"` is now load-bearing for a second reason: the per-file
      // database name in test-app.helper.ts is a module-level variable, and it
      // is the fresh-fork-per-file behaviour that keeps it per file.
      pool: "forks",
      fileParallelism: false,
      maxWorkers: 1,
      coverage: {
        // Verbatim from jest.config.json `collectCoverageFrom`.
        include: ["src/**/*.{ts,tsx}"],
        exclude: [
          "src/main.ts",
          "src/otel.ts",
          // MDRS-58's spec exporter. A process entry point like main.ts above:
          // it boots the Nest container in preview mode and writes a file, so
          // the only way to exercise it is to run it. What it delegates to —
          // src/config/openapi-document.ts — is unit-tested directly, in
          // test/unit/openapi-document.spec.ts.
          "src/openapi/export-openapi.ts",
          // MDRS-25's root-.env loader — see the note in apps/teskilat's config.
          "src/load-env.ts",
          "src/config/config.ts",
          "src/**/index.ts",
          "src/**/constants.ts",
          "src/**/enums.ts",
          "src/**/dto/**",
          "src/**/types/**",
        ],
        // Jest configured no thresholds at all, so coverage was collected and
        // never gated. Measured on the full 8-suite run (Node 22.20.0, v8
        // provider): statements 63.10, branches 53.95, functions 62.22, lines
        // 63.01. The floors below sit ~3 points under that to absorb v8
        // variance across Node majors — CI runs Node 24, this was measured on
        // 22. Raise them as coverage improves; never lower one to make a run
        // pass. Full numbers: docs/migration/mdrs-20-jest-to-vitest.md.
        thresholds: {
          statements: 60,
          branches: 50,
          functions: 58,
          lines: 60,
        },
      },
    },
  })
);
