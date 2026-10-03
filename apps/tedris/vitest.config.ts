/**
 * tedris-web — Vitest config for the `test` target (MDRS-101).
 *
 * The first specs in a web app: node environment, no DOM, so they cover what
 * runs on the server or is pure — the NextAuth wiring, the middleware and the
 * post-sign-in decision. `~/…` resolves like tsconfig's `paths`. The env
 * values are placeholders that only satisfy `env.ts`'s schema; nothing here
 * reaches Keycloak or the API.
 */
import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "../../vitest.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    // tsconfig says `jsx: preserve` for Next; the specs need it compiled.
    esbuild: { jsx: "automatic" },
    resolve: {
      alias: [{ find: /^~\/(.*)$/, replacement: `${__dirname}/$1` }],
    },
    test: {
      root: __dirname,
      include: ["test/**/*.spec.ts"],
      exclude: ["node_modules/**", ".next/**"],
      // The render specs import their component on first use; on a cold CI
      // runner that transform alone ran past Vitest's 5 s default.
      testTimeout: 30_000,
      // next-intl's ESM build imports `next/server` without an extension,
      // which Node's own resolver refuses; inlined, Vite resolves it.
      server: { deps: { inline: ["next-intl"] } },
      env: {
        KEYCLOAK_CLIENT_ID: "tedris-test",
        KEYCLOAK_CLIENT_SECRET: "test-secret",
        KEYCLOAK_ISSUER: "http://127.0.0.1:1/realms/test",
        NEXTAUTH_URL: "http://localhost:4000",
        NEXTAUTH_SECRET: "test-nextauth-secret",
        TEDRISAT_API_BASE_URL: "http://127.0.0.1:1",
      },
    },
  })
);
