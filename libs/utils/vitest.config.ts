/**
 * utils — Vitest config for the `test` target (MDRS-109).
 *
 * The first specs for this package, so that pure helpers the web apps rely on
 * but cannot test themselves (no web test runner exists yet) are covered
 * somewhere. No SWC plugin: nothing here uses decorators.
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
        // Only what has specs so far. meeting-platform.ts and the rest of
        // index.ts are untested; widening this is part of writing their specs.
        include: ["src/time-zone.ts", "src/callback-url.ts"],
      },
    },
  })
);
