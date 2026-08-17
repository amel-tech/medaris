/**
 * tedrisat — Vitest config for `test:e2e` (MDRS-20).
 *
 * Replaces `test/jest-e2e.json`, whose `testRegex` was
 * `.*\.e2e.*\.spec\.ts$` against `rootDir: ".."` — i.e. the four
 * `test/e2e/*.e2e.spec.ts` suites, which the glob below selects.
 *
 * These four also run under the `test` target (see `vitest.config.ts`), exactly
 * as they did under Jest: `test:e2e` is a narrower re-run, not extra coverage.
 */
import { defineConfig, mergeConfig } from "vitest/config";
import integrationBaseConfig from "../../vitest.integration.config";
import { nestSwcPlugin } from "./vitest.config";

export default mergeConfig(
  integrationBaseConfig,
  defineConfig({
    plugins: [nestSwcPlugin()],
    test: {
      root: __dirname,
      include: ["test/**/*.e2e.spec.ts"],
      exclude: ["node_modules/**", "dist/**"],
    },
  })
);
