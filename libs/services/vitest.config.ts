/**
 * services — Vitest config for the `test` target (MDRS-287, MDRS-290).
 *
 * The first specs for this package: the file proxy the web apps' route
 * handlers share, and the file rules their pages share. Node environment,
 * `fetch` stubbed in every spec, so nothing here opens a socket. The
 * generated tedrisat client is not covered.
 *
 * `server-only` throws unless it is resolved under React's `react-server`
 * condition, which Next applies to server code and Node does not; pointing it
 * at an empty module lets a spec import `@medaris/services/file-proxy` and the
 * `@medaris/auth/server` it builds on (as in `libs/auth/vitest.config.ts`).
 */
import { join } from "node:path";
import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "../../vitest.config";

const empty = join(__dirname, "test/stubs/empty.ts");

export default mergeConfig(
  baseConfig,
  defineConfig({
    resolve: {
      alias: [{ find: /^server-only$/, replacement: empty }],
    },
    test: {
      root: __dirname,
      include: ["test/**/*.spec.ts"],
      exclude: ["node_modules/**"],
      coverage: {
        include: ["src/file-proxy/**/*.ts", "src/file-rules/**/*.ts"],
      },
    },
  })
);
