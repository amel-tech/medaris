/**
 * env — Vitest config for the `test` target.
 *
 * No SWC plugin: unlike the two Nest apps, nothing here uses decorators, so
 * esbuild's default transform is enough and `unplugin-swc` is not a dependency
 * of this package.
 */
import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "../../vitest.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      root: __dirname,
      include: ["test/**/*.spec.ts"],
      exclude: ["node_modules/**"],
      coverage: {
        // Only the implementation. src/root-env.d.ts is declarations and emits
        // no executable statements, so including it would report 0/0 and drag
        // every figure below down for no reason.
        include: ["src/**/*.cjs"],
        // Measured on Node 22.20.0 with the v8 provider: 74/74 statements,
        // 42/42 branches, 6/6 functions, 66/66 lines — 100% on all four. The
        // floors sit below that rather than at it: v8's counts shift slightly
        // across Node majors (CI runs 24, this was measured on 22), and a floor
        // pinned at exactly 100 turns that variance into a red build. 95 is
        // still tight enough that dropping a whole test fails the gate.
        thresholds: {
          statements: 95,
          branches: 95,
          functions: 95,
          lines: 95,
        },
      },
    },
  })
);
