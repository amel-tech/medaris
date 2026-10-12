/**
 * nizam-web — Vitest config for the `test` target (MDRS-101).
 *
 * This app's first specs, set up like tedris-web's: node environment, no DOM,
 * so they cover what runs on the server or is pure — the auth wiring, the
 * proxy and the sidebar's logo link. `~/…` resolves like tsconfig's
 * `paths`. The env values are placeholders that only satisfy `env.ts`'s
 * schema; nothing here reaches Keycloak or the API.
 *
 * `server-only` throws unless it is resolved under React's `react-server`
 * condition, which Next applies to server code and Node does not. Pointing it
 * at an empty module is what lets a spec import `~/lib/auth` and through it
 * `@medaris/auth/server` (libs/auth/README.md, "Tests in the app").
 */
import { join } from "node:path";
import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "../../vitest.config";

const empty = join(__dirname, "test/stubs/empty.ts");

export default mergeConfig(
  baseConfig,
  defineConfig({
    // tsconfig says `jsx: preserve` for Next; the specs need it compiled.
    esbuild: { jsx: "automatic" },
    resolve: {
      alias: [
        { find: /^~\/(.*)$/, replacement: `${__dirname}/$1` },
        { find: /^server-only$/, replacement: empty },
      ],
    },
    test: {
      root: __dirname,
      include: ["test/**/*.spec.{ts,tsx}"],
      exclude: ["node_modules/**", ".next/**"],
      // next-intl's ESM build imports `next/server` without an extension,
      // which Node's own resolver refuses; inlined, Vite resolves it.
      server: { deps: { inline: ["next-intl"] } },
      env: {
        KEYCLOAK_CLIENT_ID: "nizam-test",
        KEYCLOAK_CLIENT_SECRET: "test-secret",
        KEYCLOAK_ISSUER: "http://127.0.0.1:1/realms/test",
        NEXTAUTH_URL: "http://localhost:4001",
        NEXTAUTH_SECRET: "test-nextauth-secret",
        TEDRISAT_API_BASE_URL: "http://127.0.0.1:1",
      },
    },
  })
);
