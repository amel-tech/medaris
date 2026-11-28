/**
 * sarf — Vitest config for the `test` target.
 *
 * Pure TypeScript with no DOM and no Node API, so the node environment of the
 * workspace base is all it needs. No SWC plugin: nothing here uses decorators.
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
      coverage: { include: ["src/**/*.ts"] },
    },
  })
);
