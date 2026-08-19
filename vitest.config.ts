/**
 * Shared Vitest base for the whole workspace (MDRS-20).
 *
 * Per-project configs `mergeConfig` this file, so anything that must be true
 * everywhere belongs here and nothing project-specific does. `nx.json`
 * `sharedGlobals` lists this path, so editing it invalidates every cached
 * `test` result — which is the point.
 *
 * Deliberately does NOT set `test.include`: `mergeConfig` concatenates arrays,
 * so a base glob would leak into every project's spec selection and could not
 * be narrowed. Each project owns its own `include`.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Keeps `describe` / `it` / `expect` / `beforeEach` / `vi` ambient, so the
    // specs inherited from Jest need no import churn.
    globals: true,
    environment: "node",
    // A project whose glob matches nothing is a dropped suite, not a pass.
    passWithNoTests: false,
    // Replaces jest-junit; Vitest ships the reporter, so no extra dependency.
    reporters: ["default", "junit"],
    outputFile: { junit: "./coverage/junit.xml" },
    coverage: {
      provider: "v8",
      reporter: ["json-summary", "text", "html"],
      reportsDirectory: "./coverage",
    },
  },
});
