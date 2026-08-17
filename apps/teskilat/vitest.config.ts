/**
 * teskilat — Vitest config for the `test` target (MDRS-20).
 *
 * Replaces `jest.config.json`. Same shape as tedrisat's, minus the
 * Testcontainers concerns: teskilat's single e2e suite talks to no database.
 */
import swc from "unplugin-swc";
import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "../../vitest.config";

/**
 * See the long comment in `apps/tedrisat/vitest.config.ts`: NestJS DI reads
 * `design:paramtypes`, esbuild (Vitest's default transform) emits no decorator
 * metadata at all, and these three SWC flags are what keep it alive. Without
 * them DI breaks at runtime in tests while `tsc --noEmit` and `nest build`
 * both stay green.
 */
export const nestSwcPlugin = () =>
  swc.vite({
    tsconfigFile: false,
    jsc: {
      target: "es2022",
      parser: { syntax: "typescript", decorators: true },
      transform: { legacyDecorator: true, decoratorMetadata: true },
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
      coverage: {
        // Verbatim from jest.config.json `collectCoverageFrom`.
        include: ["src/**/*.{ts,tsx}"],
        exclude: [
          "src/main.ts",
          "src/otel.ts",
          // MDRS-25's root-.env loader. Same category as main.ts: it runs once
          // as the first import of the process and has no unit surface. It is
          // named here because it arrived after these floors were measured, and
          // 16 uncovered lines against this app's 23 statements put every one
          // of the four thresholds under water at once.
          "src/load-env.ts",
          "src/config/config.ts",
          "src/**/index.ts",
          "src/**/constants.ts",
          "src/**/enums.ts",
          "src/**/dto/**",
          "src/**/types/**",
        ],
        // Jest gated nothing. Measured on the 2-suite run (Node 22.20.0, v8):
        // statements 70 (7/10), branches 100 (0/0), functions 66.66 (4/6),
        // lines 70 (7/10). Floors sit under that to absorb v8 variance across
        // Node majors (CI is on 24, this was measured on 22). `branches` is
        // deliberately NOT 100: that figure is 0/0, so the first real branch
        // added would drop it to 0 and fail for no good reason.
        thresholds: {
          statements: 65,
          branches: 50,
          functions: 62,
          lines: 65,
        },
      },
    },
  })
);
