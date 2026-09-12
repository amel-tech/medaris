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
      // jest.config.json set `testTimeout: 60000` and `maxWorkers: 1`. Jest
      // applied that timeout to hooks too; Vitest does not, and the
      // Testcontainers boot lives in a `beforeAll`.
      testTimeout: 60_000,
      hookTimeout: 180_000,
      teardownTimeout: 60_000,
      // jest.config.json's `maxWorkers: 1` — the e2e suites each boot their
      // own postgres container and must not race for the Docker daemon. Vitest 4
      // removed `poolOptions`, so `singleFork` would be silently ignored;
      // `fileParallelism: false` is the option that actually serialises, and it
      // forces `maxWorkers` to 1.
      pool: "forks",
      fileParallelism: false,
      maxWorkers: 1,
      coverage: {
        // Verbatim from jest.config.json `collectCoverageFrom`.
        include: ["src/**/*.{ts,tsx}"],
        exclude: [
          "src/main.ts",
          "src/otel.ts",
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
