// ESLint is used ONLY for Nx module boundary enforcement.
// All other linting and formatting is handled by Biome.
import nxEslintPlugin from "@nx/eslint-plugin";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/out/**",
      "**/out-tsc/**",
      "**/.next/**",
      "**/.output/**",
      "**/.tsbuild/**",
      "**/.nx/**",
      "**/coverage/**",
      "**/storybook-static/**",
      "**/routeTree.gen.ts",
      "apps/keycloak-theme/src/kc.gen.tsx",
      "apps/keycloak-theme/.keycloakify/**",
      "libs/services/src/**/generated/**",
      "libs/services/swagger-docs/**",
      "libs/tokens/theme/**",
      // The four below keep this list in step with biome.json's `files.includes`.
      // Biome additionally honours .gitignore via `vcs.useIgnoreFile`; ESLint's flat
      // config does not, so anything gitignored-but-present has to be repeated here or
      // `module-boundaries` will parse it. `dist_keycloak` and the dev-resources
      // directory only exist after `keycloakify build`, which is exactly when this
      // matters — that run drops minified bundles into the tree.
      "apps/keycloak-theme/dist_keycloak/**",
      "apps/keycloak-theme/public/keycloakify-dev-resources/**",
      "apps/*/public/mocks/**",
      "**/*.min.js",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "**/*.mjs"],
    plugins: {
      "@nx": nxEslintPlugin,
    },
    languageOptions: {
      parser: tseslint.parser,
    },
    linterOptions: {
      // Silence existing eslint-disable comments — we only enforce boundaries here
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      "@nx/enforce-module-boundaries": [
        "error",
        {
          enforceBuildableLibDependency: true,
          // No escape hatches beyond the two below. MDRS-13's AC allows an
          // exception only when it is documented inline with its removal
          // condition (ADR-001 §D5), so both carry one.
          //
          // MDRS-20: the two workspace-root Vitest base configs, which each
          // project's own vitest config `mergeConfig`s. They are test-runner
          // configuration, not importable source, so they are reachable only by
          // relative path — the rule otherwise rejects them as "External
          // resources cannot be imported using a relative or absolute path".
          // This whitelists two import specifiers; it exempts no file from the
          // rule. Removal condition: drop each entry when the matching root
          // config stops being imported by relative path — either because the
          // per-project configs stop extending a shared base, or because the
          // base is published as a real workspace package with an `exports`
          // entry that the target-project locator can resolve.
          allow: ["../../vitest.config", "../../vitest.integration.config"],
          // Normative taxonomy: ADR-001 §D5. Two enforced axes (`scope`,
          // `platform`) plus a documentary `type` axis that carries no
          // constraints. Every matching constraint applies cumulatively, so a
          // `scope:app` + `platform:web` project is checked against the generic
          // `scope:app` rule, the `allSourceTags` narrowing, AND the platform
          // exclusion. `scope:app` appears in no allowed list, so no project may
          // depend on an app — but note that a `@medaris/<app>` specifier never
          // resolves to a project (apps declare no `main`/`exports`), so only the
          // relative form is actually caught. Measured, see
          // docs/migration/mdrs-13-module-boundaries.md.
          //
          // Platform isolation uses `notDependOnLibsWithTags`, never a positive
          // list: `onlyDependOnLibsWithTags` rejects any dependency on an
          // untagged project, and `scope:shared` libs deliberately carry no
          // platform tag so both sides can import them.
          depConstraints: [
            {
              sourceTag: "scope:shared",
              onlyDependOnLibsWithTags: ["scope:shared"],
            },
            {
              sourceTag: "scope:ui",
              onlyDependOnLibsWithTags: ["scope:ui", "scope:shared"],
            },
            {
              sourceTag: "scope:web",
              onlyDependOnLibsWithTags: [
                "scope:web",
                "scope:ui",
                "scope:shared",
              ],
            },
            {
              sourceTag: "scope:server",
              onlyDependOnLibsWithTags: ["scope:server", "scope:shared"],
            },
            {
              sourceTag: "scope:app",
              onlyDependOnLibsWithTags: [
                "scope:ui",
                "scope:web",
                "scope:server",
                "scope:shared",
              ],
            },
            {
              allSourceTags: ["scope:app", "platform:web"],
              onlyDependOnLibsWithTags: [
                "scope:ui",
                "scope:web",
                "scope:shared",
              ],
            },
            {
              allSourceTags: ["scope:app", "platform:node"],
              onlyDependOnLibsWithTags: ["scope:server", "scope:shared"],
            },
            {
              sourceTag: "platform:web",
              notDependOnLibsWithTags: ["platform:node"],
            },
            {
              sourceTag: "platform:node",
              notDependOnLibsWithTags: ["platform:web"],
            },
          ],
        },
      ],
    },
  },
];
