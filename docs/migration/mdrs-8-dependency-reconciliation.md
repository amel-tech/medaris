# MDRS-8 — Dependency Reconciliation & pnpm Catalog

**Issue:** [MDRS-8](https://linear.app/amel-tech/issue/MDRS-8) (epic [MDRS-6](https://linear.app/amel-tech/issue/MDRS-6))
**Implements:** [ADR-001](../adr/001-monorepo-merge-and-layout.md) §D8 (toolchain pins) and §D11 (catalog governance)
**Baseline:** `madrasah-backend@main` (`c885f6d`) + `madrasah-frontend@main` (`c0eaf27`), lockfiles both `lockfileVersion: 3`, verified 2026-07-24.

> **Scope boundary.** This document reconciles the two repos onto **one working set of versions** for the merge. Upgrading that set to latest secure stable is [MDRS-21](https://linear.app/amel-tech/issue/MDRS-21)'s job — deliberately separate, so that "the merge broke it" and "the upgrade broke it" are never the same debugging session. **No version here is chosen because it is newest.** Where ADR-001 §D8 already fixed a pin, that pin is normative and copied verbatim; this document fills the long tail and produces the copy-paste catalog for [MDRS-10](https://linear.app/amel-tech/issue/MDRS-10).

## 0. Method

1. Extracted every declared external dependency (`dependencies` + `devDependencies`) from all 20 workspace `package.json` files: backend root + `apps/{tedrisat,teskilat}` + `libs/common`; frontend root + `apps/{keycloak-theme,landing,nazir,nizam,tedris}` + `shared/{eslint-config,hooks,i18n,icons,mocks,services,tokens,types,typescript-config,ui,utils}`.
2. Resolved each against the two `package-lock.json` trees for the actually-installed version(s).
3. Diffed for the overlap set (present in **both** repos) and classified each collision.
4. Cross-checked `npm audit --package-lock-only` on both trees for security floors, and scanned both locks for `hasInstallScript` packages to decide the `onlyBuiltDependencies` allowlist.

**Counts:** 138 distinct external packages total — **14 shared** (both repos), 52 backend-only, 72 frontend-only. Of the 14 shared, **10 resolve to different versions** (the collision set below). The overlap is entirely the **toolchain** (eslint/typescript/prettier/commitlint/husky/turbo/@types/node) — exactly the surface ADR-001 §D8 governs; the two runtime stacks (NestJS vs Next/React) do not overlap at all.

> **Baseline correction.** ADR-001 §D8 was verified against the working trees on 2026-07-21 and records Next `~16.1.6` / React `~19.1.1`. A local frontend feature branch (`feature/landing-page-tailwind`) still carried Next 15.x; this reconciliation was re-run against **`main`**, which confirms `next@^16.1.6` + `react@^19.1.1` across all four Next apps. The catalog follows `main`, not any feature branch.

---

## 1. Conflict table — the 14 shared dependencies

`BE` = madrasah-backend, `FE` = madrasah-frontend. "Resolved" is the version(s) present in that repo's lock tree (multiple = same package resolved at different depths). "Breaking?" = does adopting the chosen version force a source or config change.

| Package | BE range | FE range | BE resolved | FE resolved | **Chosen** | Breaking? | Rationale |
| -- | -- | -- | -- | -- | -- | -- | -- |
| `@commitlint/cli` | `^19.8.1` | `^19.8.1` | 19.8.1 | 19.8.1 | **`^21.0.2`** | config re-check (MDRS-14) | ADR §D8 normative (R2 set). 19→21 is a deliberate toolchain adoption, not an upgrade; MDRS-14 validates `commitlint.config.mjs` compatibility. |
| `@commitlint/config-conventional` | `^19.8.1` | `^19.8.1` | 19.8.1 | 19.8.1 | **`^21.0.2`** | must move with `cli` | Version-locked to `@commitlint/cli`. |
| `husky` | `^9.1.7` | `^9.1.7` | 9.1.7 | 9.1.7 | **`^9.1.7`** | no | Identical; ADR §D8. |
| `@eslint/eslintrc` | `^3.2.0` | `^3.3.1` | 3.3.5 | 3.3.1 | **dropped** | n/a | ESLint reduced to boundaries-only (ADR §D5); flat-config helper not needed under `@nx/eslint`. MDRS-12 confirms. |
| `@eslint/js` | `^9.18.0` | `^9.33.0` | 9.39.4 | 9.35.0 | **dropped** | n/a | Same — see `@eslint/eslintrc`. If the root `eslint.config.mjs` needs it, it floors to `eslint`'s major (`^10`). |
| `eslint` | `^9.18.0` | `^9,^9.33.0,^9.28.0,^9.34.0` | 9.39.4 | 9.35.0 | **`^10.5.0`** | boundaries-only surface | ADR §D8 normative (R2 pairing). Only `@nx/enforce-module-boundaries` runs on it after MDRS-12/13; the app-level plugin churn is evicted (see §4). |
| `typescript-eslint` | `^8.20.0` | `^8.39.1` | 8.59.2 | 8.44.0 | **`^8.62.0`** | no | ADR §D8 normative (R2 pairing); TS 5.9 sits inside its peer range. |
| `typescript` | `^5.7.3, ^5.8.3` | `^5.2.2, ^5, ^5.9.2, ^5.4.5` | 5.9.3 \| 6.0.3 | 5.9.2 | **`~5.9.3`** | no | ADR §D8 normative. Both repos already resolve 5.9.x → zero delta; the BE-tree `6.0.3` is a hoisted transitive, not a workspace choice. Tilde ≈ frozen (5.9 is the last JS-based line). |
| `@types/node` | `^22.10.7` | `^20, ^24, ^24.3.0` | 22.19.17 (+transitive 14/18/25) | 20.19.16 \| 24.5.1 | **`^22`** | **yes → follow-up** | ADR §D8 pins the **prod** floor (`node:22-alpine`), not dev Node. FE apps/libs declaring `^24`/`^20` are dropped to `^22`; any 24-only type usage fails typecheck. See [FU-1](#5-follow-up-issues). |
| `eslint-config-prettier` | `^10.0.1` | `^10.1.8` | 10.1.8 | 10.1.8 | **dropped** | n/a | Prettier removed; Biome owns formatting (ADR §D8/§D5). |
| `eslint-plugin-prettier` | `^5.2.2` | `^5.5.4` | 5.5.5 | 5.5.4 | **dropped** | n/a | Same. |
| `prettier` | `^3.4.2` | `^3.6.2, 3.3.1` | 3.8.3 | 3.3.1 \| 3.6.2 | **dropped** | n/a | Replaced by Biome 2.4.4 (ADR §D8). |
| `turbo` | `^2.5.5` | `^2.5.6` | 2.9.9 | 2.5.6 | **dropped** | n/a | Replaced by Nx 23.0.0 (ADR §D8/MDRS-11). `@turbo/gen`, `eslint-plugin-turbo` go with it. |
| `globals` | `^16.0.0` | `^15.12.0, ^16.3.0` | 16.5.0 | 15.15.0 \| 16.4.0 | **`^16.3.0`** *(if retained)* | no | Only relevant if a hand-rolled flat config survives MDRS-12; otherwise dropped with the eslint helpers. Reconciled up to `^16.3.0`. |

**Reading of the table:** 6 of the 14 shared packages are **removed by an ADR toolchain decision** (prettier stack → Biome; turbo → Nx; eslint flat-config helpers → boundaries-only). Only `typescript`, `@types/node`, `eslint`, `typescript-eslint`, `commitlint×2`, `husky` are genuinely reconciled — and every one of those is already pinned normatively by ADR §D8. **The single collision that forces source work is `@types/node` (24→22).**

---

## 2. Draft `catalog:` block

The full copy-paste `pnpm-workspace.yaml` is in [`pnpm-workspace.draft.yaml`](./pnpm-workspace.draft.yaml). What follows is the catalog rationale by group. Pin style follows ADR-001 Context rule 2: **tilde/exact for framework-critical existing deps** (a fresh pnpm resolve re-floats every caret — a hidden-upgrade event), **caret acceptable for the long tail** where patch drift is harmless and matches the repos' existing declared ranges.

### 2a. Toolchain — normative from ADR §D8 (copied, not re-decided)

| Catalog entry | Pin | Source |
| -- | -- | -- |
| `nx` + every `@nx/*` | `23.0.0` (exact) | §D8 — added by MDRS-11; not in either repo today |
| `typescript` | `~5.9.3` | §D8 |
| `@types/node` | `^22` | §D8 (prod floor) |
| `@biomejs/biome` | `2.4.4` (exact) | §D8 — new (MDRS-12); exact so the reformat commit is byte-reproducible for `.git-blame-ignore-revs` |
| `eslint` | `^10.5.0` | §D8 (boundaries-only) |
| `typescript-eslint` | `^8.62.0` | §D8 |
| `vitest`, `@vitest/coverage-v8`, `@vitest/ui` | `^4.1.9` | §D8/§D9 — new (MDRS-20) |
| `@swc/core` | `~1.15.43` | §D8 — floors the backend's `1.15.33`; `emitDecoratorMetadata` under Vitest |
| `unplugin-swc` | *(pinned at MDRS-20 spike)* | §D8 — no in-house precedent |
| `husky` / `lint-staged` / `@commitlint/cli` + `config-conventional` | `^9.1.7` / `^17.0.8` / `^21.0.2` | §D8 (R2 set) |

`packageManager` is `pnpm@11.4.0` with engines `pnpm >=11.0.0`, `node >=22` (§D8) — set in the root `package.json`, not the catalog.

### 2b. Backend runtime & framework — reconciled (BE-only, existing versions kept)

NestJS pinned per ADR §D8 (`~11.1.19` floor, tilde blocks minor/major; patch drift to 11.1.28 accepted). Everything else keeps its **existing declared range** — no chase:

- `@nestjs/common|core|platform-express|testing` → `~11.1.19`; `@nestjs/config` `^4.0.2`; `@nestjs/cache-manager` `^3.0.1`; `@nestjs/swagger` `^11.2.0`; `@nestjs/cli` `^11.0.10`; `@nestjs/schematics` `^11.0.7`.
- `@nestjs/class-transformer` `^0.4.0` + `@nestjs/class-validator` `^0.13.4` (NestJS forks, tedrisat) **coexist with** standalone `class-transformer` `^0.5.1` + `class-validator` `^0.14.2` (libs/common) — this is intentional in the backend today; catalog keeps both pairs. *(Flagged for the `common` split, MDRS-13, not here.)*
- `drizzle-orm` `^0.45.2` / `drizzle-kit` `^0.31.4` (§D8, equals R2); `pg` `^8.16.3` / `@types/pg` `^8.15.4`.
- `cache-manager` `^7.1.1`; `compression` `^1.8.1` / `@types/compression` `^1.8.1`; `helmet` `^8.1.0`; `exceljs` `^4.4.0`; `jsonwebtoken` `^9.0.2` / `@types/jsonwebtoken` `^9.0.10`; `pino` `^9.7.0` / `pino-pretty` `^13.0.0`; `winston` `^3.17.0`; `@types/express` `^5.0.0`; `@types/multer` `^2.0.0` *(ADR §D4: moves runtime→dev)*.
- OpenTelemetry — reconcile the tedrisat(`^0.207`)/teskilat(`^0.208`) drift **upward** to the already-declared higher value (ADR §D8): `@opentelemetry/sdk-node` `^0.208.0`, `exporter-trace-otlp-grpc` `^0.208.0`, `auto-instrumentations-node` `^0.67.2`, `resources` `^2.0.1`, `semantic-conventions` `^1.36.0`.

Backend build/test tooling kept: `@swc/cli` `^0.7.8`, `ts-node` `^10.9.2`, `ts-loader` `^9.5.2`, `tsconfig-paths` `^4.2.0`, `source-map-support` `^0.5.21`, `rimraf` `^6.0.1`, `supertest` `^7.0.0` / `@types/supertest` `^6.0.2`, `testcontainers` + `@testcontainers/postgresql` `^11.5.1`, `audit-ci` `^7.1.0`, `depcheck` `^1.4.7`.

### 2c. Frontend runtime & framework — reconciled (FE-only, existing versions kept)

- `next` `~16.1.6`; `react` / `react-dom` `~19.1.1`; `@types/react` `^19` / `@types/react-dom` `^19` (§D8; keycloak-theme's stray `@types/react@^18.3.23` is corrected up to 19 in MDRS-10 — see [FU-4](#5-follow-up-issues)).
- Radix UI (13 packages, `shared/ui`) — each kept at its single declared caret: `@radix-ui/react-alert-dialog@^1.1.15`, `-avatar@^1.1.10`, `-checkbox@^1.3.2`, `-collapsible@^1.1.12`, `-context-menu@^2.2.16`, `-dialog@^1.1.15`, `-dropdown-menu@^2.1.15`, `-hover-card@^1.1.14`, `-label@^2.1.7`, `-popover@^1.1.15`, `-select@^2.2.5`, `-separator@^1.1.7`, `-slot@^1.2.3`, `-switch@^1.2.6`, `-tabs@^1.1.13`, `-tooltip@^1.2.8`.
- `@phosphor-icons/react@^2.1.10`; `@tanstack/react-table@^8.21.3`; `@hookform/resolvers@^5.2.2`; `react-hook-form@^7.64.0`; `sonner@^2.0.7`; `next-themes@^0.4.6`; `next-auth@^4.24.11`; `next-intl@^4.4.0`; `@t3-oss/env-nextjs@^0.13.8`; `@fontsource/scheherazade-new@^5.2.8`.
- Styling utils: `class-variance-authority@^0.7.1`, `clsx@^2.1.1`, `tailwindcss-animate@^1.0.7`, `tw-animate-css@^1.3.7`. **`tailwind-merge` → `^3.3.1`** (unify to the `shared/ui` major; `apps/tedris` is on `^1.14.0` — a breaking v1→v3 API gap: see [FU-2](#5-follow-up-issues)).
- `zod` → `~3.25.76` (§D8 catalog exception #2 candidate; only `@medaris/ui` declares `^4` — port ui or keep a per-package exception: [FU-3](#5-follow-up-issues) / ADR Escalation #1).
- Observability: `@opentelemetry/api@^1.9.0`, `@vercel/otel@^1.13.0`.
- `xlsx@^0.18.5` (nizam) — **security follow-up**, cannot be floored on npm: [FU-5](#5-follow-up-issues).

### 2d. Frontend build / styling / codegen — reconciled

- Tailwind v4 line: `tailwindcss@~4.1.13`, `@tailwindcss/postcss@^4.1.12`, `@tailwindcss/vite@^4.1.11`, `lightningcss@^1.30.1`; `postcss@^8`, `autoprefixer@^10.4.21`.
- keycloak-theme island (ADR §D8 exception #1, frozen through merge): `vite@~5.4.21`, `@vitejs/plugin-react@^4.2.1`, `keycloakify@~11.9.6`, `@storybook/react@^8.1.10`, `@storybook/react-vite@^8.1.10`, `storybook@^8.1.10`. `@tailwindcss/vite` also lives here.
- Codegen/i18n tooling: `@openapitools/openapi-generator-cli@^2.24.0` (`shared/services`), `@tolgee/cli@^2.10.2` (`shared/i18n`), `jiti@^2.5.1`.
- `@next/bundle-analyzer@^15.4.6` — lags Next 16; keep now, bump to 16 in MDRS-21 (harmless dev-only analyzer). `onchange@^7.1.0` (services watch) — kept; MDRS-11 may replace with an Nx target.
- `esbuild@^0.21.5` — **kept** (FE root + several shared libs; also Vitest's bundler). Native build allowed (§3).

---

## 3. `onlyBuiltDependencies` / `allowBuilds`

Derived from `hasInstallScript: true` across both locks, filtered to native/build steps that must actually run (ADR §D11: approve real native deps, **deny watchers/telemetry by default**, no speculative entries).

**Allow (build required):**

```yaml
onlyBuiltDependencies:
  - '@swc/core'                        # BE: NestJS SWC transform (native)
  - esbuild                            # both: Vitest/tsx bundler (native)
  - nx                                 # MDRS-11: Nx native daemon
  - '@tailwindcss/oxide'               # FE: Tailwind v4 native engine
  - lightningcss                       # FE: native CSS transform
  - unrs-resolver                      # transitive: native resolver (eslint/nx)
  - sharp                              # FE: Next.js image optimization (native, REQUIRED for build/runtime)
  - '@openapitools/openapi-generator-cli'  # FE: shared/services — postinstall fetches the generator jar
```

**Deny (default — do not build):** `fsevents`, `@parcel/watcher` (macOS/file watchers — pnpm skips by default; not needed in CI), `@scarf/scarf`, `core-js-pure`, `@nestjs/core`'s scarf install hook (telemetry postinstalls — no build value), `cpu-features`, `ssh2`, `protobufjs` (transitive test/OTel infra — work without their optional native/codegen steps; add only if a test proves otherwise).

---

## 4. Dependencies **not** cataloged (removed by a toolchain decision)

These appear in a workspace `package.json` today but must **not** enter the catalog — an ADR decision deletes them. Listed so MDRS-10 removes them deliberately rather than carrying them forward.

| Package(s) | Removed by | ADR ref |
| -- | -- | -- |
| `prettier`, `eslint-config-prettier`, `eslint-plugin-prettier` | Biome owns format | §D8, §D5 |
| `turbo`, `@turbo/gen`, `eslint-plugin-turbo` | Nx replaces Turborepo | §D8, MDRS-11 |
| `jest`, `@types/jest`, `ts-jest`, `jest-junit` | Vitest everywhere | §D9, MDRS-20 |
| `eslint-config-next`, `@next/eslint-plugin-next`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `@stylistic/eslint-plugin`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `eslint-plugin-storybook`, `eslint-plugin-only-warn`, `eslint-plugin-unused-imports` | ESLint reduced to boundaries-only; these live in `shared/eslint-config` which dissolves | §D4, §D5 |
| `@eslint/js`, `@eslint/eslintrc`, `globals` | flat-config helpers not needed under `@nx/eslint` (confirm in MDRS-12; retain `globals@^16.3.0` only if a hand-rolled config survives) | §D5 |
| `@faker-js/faker` | `shared/mocks` deleted after merge | §D4 |
| *(no files)* `.prettierrc`/`.prettierignore` | never existed (ADR correction) | §Corrections |

`shared/typescript-config` and `shared/eslint-config` themselves dissolve into root configs (ADR §D4) — their contents above go with them.

---

## 5. Follow-up issues

Per MDRS-8 AC: any conflict requiring **source changes** gets its own follow-up rather than being silently absorbed. Recommended to file under epic MDRS-6:

| # | Title | Why it needs source work | Suggested pin / action | Priority |
| -- | -- | -- | -- | -- |
| **FU-1** | `@types/node` 24→22 alignment | FE apps/libs declaring `^24`/`^20` drop to `^22` (prod floor); any Node-24-only type API fails `tsc`. | Codemod `@types/node` → catalog `^22`; run `nx run-many -t typecheck`; fix fallout. | Medium — do inside MDRS-10 |
| **FU-2** | Unify `tailwind-merge` to v3 | `apps/tedris` uses `^1.14.0`; `@medaris/ui` uses `^3.3.1`. v1→v3 changed the config/merge API — a real breaking gap. | Migrate tedris's `tailwind-merge` usage to v3, then catalog `^3.3.1`. | Medium |
| **FU-3** | `zod` 3 vs 4 in `@medaris/ui` | Apps run v3; only `ui` declares `^4`. Catalog pins `~3.25.76`. Needs the 30-min ui-API check (ADR Escalation #1) before MDRS-10 executes. | Either port ui off v4-only APIs → `~3.25.76`, or keep zod a documented per-package exception until MDRS-21. | Medium — blocks MDRS-10 catalog finalization |
| **FU-4** | keycloak-theme React types | Declares `@types/react@^18.3.23` while running React 19 — pre-existing mismatch; catalog `^19` may surface typecheck errors. | Bump to `^19`; fix any React-18-typed code. | Low — do inside MDRS-10 |
| **FU-5** | Replace/​mitigate `xlsx` (SheetJS) | `xlsx@0.18.5` has prototype-pollution + ReDoS advisories with **`fixAvailable: false`** — the npm package is abandoned; an `overrides:` floor is impossible (no fixed version on npm). Used by `apps/nizam`. | Migrate to the SheetJS CDN build (`https://cdn.sheetjs.com/…`) via `overrides`/`packageExtensions`, or swap to `exceljs` (already a backend dep). | **High — security** |

`@next/bundle-analyzer` (Next 15 vs app Next 16) and the `common` validator-fork duplication (§2b) are noted but **not** blocking — they resolve in MDRS-21 and MDRS-13 respectively.

---

## 6. Security `overrides:` — deliberately empty at merge (with one carve-out)

MDRS-8 AC asks for security floors "**where no parent fix exists**, each annotated with its advisory."

The audit sweep (`npm audit --package-lock-only`, 2026-07-24) found BE 62 total / 16 high+crit, FE 53 total / 30 high+crit — but **every one except `xlsx` reports `fixAvailable: true`**, i.e. a parent bump (which MDRS-21's upgrade pass performs, or which the pnpm lockfile regeneration floats within the pinned ranges) resolves it. Adding `overrides:` for those would be doing MDRS-21's work inside the reconciliation window — exactly the split ADR-001 forbids ("no speculative entries", §D11).

**Therefore the catalog ships with an empty `overrides:` block**, save the one advisory whose fix is *not* a version bump:

- **`xlsx`** — `fixAvailable: false`. Not floorable via `overrides` (no patched version exists on the npm registry). Tracked as **FU-5** (replace, not override).

A full `pnpm audit` against the **merged** tree must be re-run at MDRS-10 (once one lockfile exists); any genuinely-transitive floor with no parent fix that surfaces then is added to `overrides:` with its advisory ID at that point — not speculatively now.

---

## 7. Acceptance criteria — status

- [x] Full conflict table produced (package → BE → FE → chosen → breaking?) — §1
- [x] Draft `catalog:` block covering every surviving shared dependency — §2 + `pnpm-workspace.draft.yaml`
- [x] Security floors as `overrides:` where no parent fix exists, annotated — §6 (empty by the "no parent fix" rule; `xlsx` is unfloorable → FU-5)
- [x] `onlyBuiltDependencies` / `allowBuilds` decided for both stacks — §3
- [x] Every conflict requiring source changes has a follow-up (FU-1…FU-5), not silently absorbed — §5
- [x] No version chosen purely because newest — long tail keeps existing declared ranges; ADR pins are toolchain-adoption, not upgrades
