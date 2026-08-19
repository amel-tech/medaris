/**
 * teskilat — Vitest config for `test:e2e` (MDRS-20).
 *
 * Replaces `test/jest-e2e.json`, whose `testRegex` was `.e2e-spec.ts$` — note
 * the hyphen. The only e2e file here is `test/e2e/app.e2e.spec.ts`, so that
 * pattern matched nothing and `pnpm test:e2e` selected zero suites; verified by
 * running the regex against the real filenames, see
 * docs/migration/mdrs-20-jest-to-vitest.md. The glob below matches the file
 * that is actually there, so this target gains one suite rather than losing any.
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
