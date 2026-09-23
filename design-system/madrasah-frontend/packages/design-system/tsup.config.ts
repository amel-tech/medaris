import { defineConfig } from "tsup";

/**
 * Emits dist/ for external consumers (ESM + CJS + .d.ts).
 * nx apps in this repo do NOT need this — they import the source directly via
 * the tsconfig.base.json path mapping, which keeps HMR and go-to-definition working.
 * Run this only when publishing the package outside the monorepo.
 */
export default defineConfig({
  entry: {
    index: "src/index.ts",
    "components/index": "src/components/index.ts",
    "components/brand/index": "src/components/brand/index.ts",
    "components/core/index": "src/components/core/index.ts",
    "components/forms/index": "src/components/forms/index.ts",
    "components/navigation/index": "src/components/navigation/index.ts",
    "components/data/index": "src/components/data/index.ts",
    "components/feedback/index": "src/components/feedback/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ["react", "react-dom"],
  loader: { ".jsx": "jsx" },
});
