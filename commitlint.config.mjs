/**
 * Conventional-commit rules for the whole monorepo (MDRS-14).
 *
 * `.mjs` per ADR-001 §D6. The root package.json has no `"type"` field, so a
 * bare `.js` config would be parsed as CommonJS — the two pre-merge repos
 * disagreed on exactly this (backend `module.exports`, frontend
 * `export default`, qauth `.mjs`). An explicit `.mjs` extension is ESM
 * regardless of the enclosing package type, so the ambiguity cannot come back.
 *
 * `scope-enum` is load-bearing, not cosmetic: release-please derives per
 * component releases from the commit scope, and one repo now produces releases
 * for 7 components. A typo'd scope silently drops a change out of its
 * component's changelog, so the enum is enforced at error level and a scope is
 * mandatory. The list below is ADR-001 §D6 verbatim and is an MDRS-17
 * acceptance criterion — extend it only together with the matching
 * release-please component and pnpm-workspace entry (ADR-001 §D10).
 *
 * Note that the four Next apps are scoped by *package/release-component* name
 * (`tedris-web`, `nizam-web`, `nazir-web`, `landing-web`), not by directory
 * name (`apps/tedris`, ...). ADR-001 §D6 sets app package names to
 * `@medaris/<release-component>` while MDRS-10 kept the directories bare; the
 * scope has to follow the component, because that is what release-please cuts
 * releases against.
 */

/** Every app and lib, plus the cross-cutting infrastructure scopes. */
const SCOPES = [
  // ── Apps (7) — release-please components, see ADR-001 §D3/§D6 ────────────
  "tedrisat",
  "teskilat",
  "tedris-web",
  "nizam-web",
  "nazir-web",
  "landing-web",
  "keycloak-theme",
  // ── Libs (9) — @medaris/<dirname> ────────────────────────────────────────
  "common",
  "ui",
  "icons",
  "tokens",
  "hooks",
  "services",
  "i18n",
  "types",
  "utils",
  // ── Cross-cutting, releases nothing on its own ───────────────────────────
  "repo", // workspace wiring: pnpm, Nx, tsconfig, Biome, hooks
  "deps", // dependency bumps (the catalog in pnpm-workspace.yaml)
  "ci", // GitHub Actions workflows
  "docs", // ADRs, migration records, README, this file's sibling docs
];

// No `@type {import("@commitlint/types").UserConfig}` annotation: that package
// is not a top-level dependency and pnpm's strict layout makes it unresolvable
// from here, so the annotation would dangle. Not worth a catalog entry.
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Spelled out rather than inherited: both pre-merge repos pinned this
    // exact list, and it is narrower than what config-conventional would
    // accept on a major bump.
    "type-enum": [
      2,
      "always",
      [
        "build",
        "chore",
        "ci",
        "docs",
        "feat",
        "fix",
        "perf",
        "refactor",
        "revert",
        "style",
        "test",
      ],
    ],
    "type-case": [2, "always", "lower-case"],
    "type-empty": [2, "never"],
    // A scope is mandatory so every change is attributable to a release
    // component. Cross-cutting work that releases nothing uses `repo`.
    "scope-empty": [2, "never"],
    "scope-enum": [2, "always", SCOPES],
    "subject-empty": [2, "never"],
    "subject-full-stop": [2, "never", "."],
    "subject-case": [2, "never", ["start-case", "pascal-case", "upper-case"]],
  },
};
