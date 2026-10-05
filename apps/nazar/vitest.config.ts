/**
 * nazir-web — Vitest config for the `test` target (MDRS-183).
 *
 * Set up like nizam-web's: node environment, so the specs cover what runs on
 * the server or is pure — the NextAuth wiring, the middleware, the message
 * catalogue, the scope and menu rules and the pages' markup
 * (`renderToStaticMarkup`). The few that need an open menu or a click ask for
 * happy-dom with a `@vitest-environment` docblock, as the kit's own specs do.
 * `~/…` resolves like tsconfig's `paths`. The env values are placeholders that
 * only satisfy `env.ts`'s schema; nothing here reaches Keycloak or the API.
 */
import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "../../vitest.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    // tsconfig says `jsx: react-jsx` for Next; the specs need it compiled.
    esbuild: { jsx: "automatic" },
    resolve: {
      alias: [{ find: /^~\/(.*)$/, replacement: `${__dirname}/$1` }],
    },
    test: {
      root: __dirname,
      include: ["test/**/*.spec.{ts,tsx}"],
      exclude: ["node_modules/**", ".next/**"],
      // The render specs import their component on first use; on a cold CI
      // runner that transform alone ran past Vitest's 5 s default.
      testTimeout: 30_000,
      // next-intl's ESM build imports `next/server` without an extension,
      // which Node's own resolver refuses; inlined, Vite resolves it.
      server: { deps: { inline: ["next-intl"] } },
      env: {
        KEYCLOAK_CLIENT_ID: "nazir-test",
        KEYCLOAK_CLIENT_SECRET: "test-secret",
        KEYCLOAK_ISSUER: "http://127.0.0.1:1/realms/test",
        NEXTAUTH_URL: "http://localhost:4002",
        NEXTAUTH_SECRET: "test-nextauth-secret",
        TEDRISAT_API_BASE_URL: "http://127.0.0.1:1",
        TEDRIS_URL: "http://localhost:4000",
      },
    },
  })
);
