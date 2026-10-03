/**
 * keycloak-theme — Vitest config for the `test` target (MDRS-100).
 *
 * The theme's first specs. Deliberately not `vite.config.ts`: that one runs
 * the keycloakify plugin, which has nothing to do in a test run.
 *
 * `*.spec.tsx` render the real login pages, so they ask for happy-dom with a
 * `@vitest-environment` docblock; the `*.spec.ts` stay in plain node. The
 * happy-dom options below exist for keycloakify, not for the specs:
 *
 *   - Template inserts `<script>` and `<link>` tags pointing at Keycloak's
 *     resource paths. Loading and evaluating them is switched off and a
 *     skipped file counts as loaded, so nothing leaves the process and the
 *     "all stylesheets loaded" gate Template waits on still opens.
 *   - keycloakify reloads the page when Template mounts a second time in one
 *     document — except under Storybook's docs view, which it recognises by
 *     `?viewMode=docs`. The specs mount one page per test, so they borrow
 *     that exemption rather than reloading happy-dom mid-test.
 *
 * `email.e2e.spec.ts` starts Keycloak and Mailpit containers, so `-t test`
 * for this project needs Docker, like tedrisat's.
 */
import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "../../vitest.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    esbuild: { jsx: "automatic" },
    test: {
      root: __dirname,
      include: ["test/**/*.spec.ts", "test/**/*.spec.tsx"],
      exclude: ["node_modules/**", "dist/**", "dist_keycloak/**"],
      environmentOptions: {
        happyDOM: {
          url: "http://localhost/?viewMode=docs",
          settings: {
            disableJavaScriptEvaluation: true,
            disableJavaScriptFileLoading: true,
            disableCSSFileLoading: true,
            handleDisabledFileLoadingAsSuccess: true,
          },
        },
      },
    },
  })
);
