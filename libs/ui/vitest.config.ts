/**
 * ui — Vitest config for the `test` target (MDRS-153).
 *
 * The kit's first specs. They render the real components into happy-dom, so
 * every `*.spec.tsx` asks for it with a `@vitest-environment` docblock. No SWC
 * plugin: nothing here uses decorators. The class layer is CSS, which happy-dom
 * does not lay out, so the specs assert the markup contract (classes, roles,
 * aria and data attributes) and not pixels.
 */
import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "../../vitest.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    esbuild: { jsx: "automatic" },
    test: {
      root: __dirname,
      include: ["test/**/*.spec.tsx", "test/**/*.spec.ts"],
      exclude: ["node_modules/**"],
    },
  })
);
