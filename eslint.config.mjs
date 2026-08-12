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
      ".migration/**",
      "**/routeTree.gen.ts",
      "apps/keycloak-theme/src/kc.gen.tsx",
      "apps/keycloak-theme/.keycloakify/**",
      "libs/services/src/**/generated/**",
      "libs/services/swagger-docs/**",
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
          allow: [],
          // Permissive on purpose: MDRS-12 only lands the shell so the rule is
          // wired and green. The real `scope:*` / `platform:*` tags and their
          // depConstraints are MDRS-13's deliverable (ADR-001 §D5 sequencing).
          depConstraints: [
            {
              sourceTag: "*",
              onlyDependOnLibsWithTags: ["*"],
            },
          ],
        },
      ],
    },
  },
];
