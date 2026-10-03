/**
 * tokens — Vitest config for the `test` target (MDRS-73).
 *
 * No SWC plugin: nothing here uses decorators. The package ships CSS, which
 * v8 cannot instrument, so coverage measures the one piece of executable
 * code the suite adds: the CSS reader in test/support/. Spec files are
 * excluded explicitly because `include` names the support directory only.
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
        include: ["test/support/**/*.ts"],
        exclude: ["**/*.spec.ts"],
        // Same floors and the same reasoning as libs/env: measured at 100% on
        // Node 22 with the v8 provider, floored at 95 so v8's small count
        // differences across Node majors (CI runs 24) do not turn red.
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
