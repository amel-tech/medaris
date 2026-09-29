/**
 * landing-web — Vitest config for the `test` target (MDRS-101).
 *
 * Set up like tedris-web's: node environment, no DOM. It covers the one piece
 * of landing that runs on the server per request, the redirect into tedris.
 * The aliases repeat tsconfig's `paths`, `~/features/*` → `./sections/*`
 * included.
 */
import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "../../vitest.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    esbuild: { jsx: "automatic" },
    resolve: {
      alias: [
        {
          find: /^~\/features\/(.*)$/,
          replacement: `${__dirname}/sections/$1`,
        },
        { find: /^~\/(.*)$/, replacement: `${__dirname}/$1` },
      ],
    },
    test: {
      root: __dirname,
      include: ["test/**/*.spec.ts"],
      exclude: ["node_modules/**", ".next/**"],
      server: { deps: { inline: ["next-intl"] } },
      env: {
        TEDRIS_APP_URL: "http://localhost:4000",
      },
    },
  })
);
