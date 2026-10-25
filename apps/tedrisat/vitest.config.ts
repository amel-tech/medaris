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
      // MDRS-89: runs in every worker and refuses any fetch that leaves this
      // machine. `globalSetup` above cannot do this — it runs once in the main
      // process, and the requests happen inside the forks.
      setupFiles: ["./test/setup-no-network.ts"],
      // jest.config.json set `testTimeout: 60000` and `maxWorkers: 1`. Jest
      // applied that timeout to hooks too; Vitest does not. The Testcontainers
      // boot has moved to `globalSetup`, which is governed by neither of these
      // — but `createTestApp` still creates a database and runs the migrations
      // from a `beforeAll`, so `hookTimeout` stays generous.
      testTimeout: 60_000,
      hookTimeout: 180_000,
      teardownTimeout: 60_000,
      // Four files at a time (2026-10-25). Until then this ran one file at a
      // time, jest.config.json's `maxWorkers: 1`, and with 211 files that one
      // target was the whole critical path of CI's Verify: 9m 55s of a 10m 35s
      // Nx run.
      //
      // Nothing the files share stood in the way any more:
      //   - each file gets its own database in the one container
      //     (test-app.helper.ts);
      //   - the four suites that start Keycloak or Mailpit get containers with
      //     generated names, and the two that need a network create their own;
      //   - temporary files come from `mkdtemp`;
      //   - nothing listens on a fixed port;
      //   - the migrations create no cluster-wide object.
      // The serial setting stood only because nobody had sized the
      // container's `max_connections`. That is now set in global-setup.ts:
      // four files × up to two Nest apps × pg's default pool of 10 is 80
      // connections, against 200.
      //
      // 4 matches the GitHub runner's vCPUs; more would just queue there.
      //
      // `pool: "forks"` is load-bearing: the per-file database name in
      // test-app.helper.ts is a module-level variable, and it is the
      // fresh-fork-per-file behaviour that keeps it per file.
      pool: "forks",
      maxWorkers: 4,
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
