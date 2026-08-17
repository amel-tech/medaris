/**
 * tedrisat — Vitest config for the `test` target (MDRS-20).
 *
 * Replaces `jest.config.json`. The spec selection below is the exact pair of
 * globs that file matched, which is why the four `test/e2e/*.e2e.spec.ts` suites
 * still run under `nx run tedrisat:test`: they were never e2e-only.
 */
import swc from "unplugin-swc";
import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "../../vitest.config";

/**
 * The one non-negotiable piece of this migration.
 *
 * NestJS resolves constructor dependencies from the `design:paramtypes`
 * metadata that `emitDecoratorMetadata` writes. Vitest transforms with esbuild
 * by default, and esbuild emits no decorator metadata at all — so DI silently
 * stops resolving in tests while `tsc --noEmit` and `nest build` stay green.
 * Routing the transform through SWC with these three flags is what keeps the
 * metadata alive:
 *
 *   - `parser.decorators`      — parse decorators at all
 *   - `transform.legacyDecorator`  — TS experimental (Stage 1) semantics, which
 *                                    is what `experimentalDecorators` in
 *                                    `tsconfig.json` selects and what Nest needs
 *   - `transform.decoratorMetadata` — the actual `design:*` emit
 *
 * Exported so `vitest.integration.config.ts` reuses the identical transform
 * rather than a drifting copy.
 */
export const nestSwcPlugin = () =>
  swc.vite({
    // Read nothing from tsconfig.json: `module: "commonjs"` there is correct for
    // `nest build` and wrong for Vitest, which needs ESM out of the transform.
    tsconfigFile: false,
    jsc: {
      target: "es2022",
      parser: { syntax: "typescript", decorators: true },
      transform: { legacyDecorator: true, decoratorMetadata: true },
      // Nest logs and some error paths read `constructor.name`.
      keepClassNames: true,
    },
    module: { type: "es6" },
    sourceMaps: true,
  });

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
      // jest.config.json's `maxWorkers: 1` — the four e2e suites each boot their
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
