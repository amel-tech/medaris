/**
 * auth — Vitest config for the `test` target (auth Phase 1).
 *
 * Node environment: the server half runs in Node, and the client half's specs
 * drive its pure decisions with injected browser stand-ins, so neither needs a
 * DOM. openid-client is mocked in every spec that reaches the IdP; nothing
 * here opens a socket.
 *
 * `server-only` throws unless it is resolved under React's `react-server`
 * condition, which Next applies to server code and Node does not. Pointing it
 * at an empty module is what lets a spec import the server entry; an app's own
 * Vitest config needs the same alias once it imports `@medaris/auth/server`.
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
        include: ["src/**/*.ts"],
      },
    },
  })
);
