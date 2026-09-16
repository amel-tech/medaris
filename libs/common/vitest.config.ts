/**
 * common — Vitest config for the `test` target (MDRS-41).
 *
 * The authorization layer (`src/authz`) is owned here, so its specs are too.
 * They used to sit under `apps/tedrisat/test/unit/authz`, which made one of
 * the library's two consumers the owner of the library's entire test coverage
 * and kept the shared matrix and guard out of every coverage measurement.
 *
 * Same shape as teskilat's config: the SWC plugin, because `AuthzGuard`,
 * `AuthzService` and the wiring assertion are decorated Nest providers and
 * esbuild drops `design:paramtypes`.
 */
import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig, { nestSwcPlugin } from "../../vitest.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [nestSwcPlugin()],
    test: {
      root: __dirname,
      include: ["test/**/*.spec.ts"],
      exclude: ["node_modules/**", "dist/**"],
      coverage: {
        // Only what these suites are about. The rest of the library (logger,
        // excel, pipes, throttler, auth-guard) has no unit suite yet; listing
        // it here would report it at 0% without saying anything new.
        include: ["src/authz/**/*.ts"],
        exclude: ["src/**/index.ts"],
      },
    },
  })
);
