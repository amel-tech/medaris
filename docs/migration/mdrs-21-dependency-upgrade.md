# MDRS-21 — dependency upgrade record

What actually shipped, what was found along the way but is explicitly out of
this ticket's scope, and what is held back with a reason. Numbers below were
measured against this branch, not estimated.

## Baseline (before this ticket)

Full gate: typecheck 16 · test 226 tests / 17 suites · build 8 · lint 16 ·
module-boundaries 16 — all green already. `pnpm audit --prod`: 32 high / 15
moderate / 2 low / 0 critical.

## What shipped

1. **Mechanical +1-major bumps**: `pino`, `dotenv`, `testcontainers` +
   `@testcontainers/postgresql`, `@types/supertest`, `@vercel/otel`,
   `@next/bundle-analyzer`.
2. **`@tanstack/react-table` 8 → 9** (nizam-web, tedris-web): the v8 API
   (`useReactTable`, `getCoreRowModel`, 2-arg `ColumnDef`) is gone from the
   package's main entry in v9. Ported onto the library's own documented
   `/legacy` compatibility subpath (`useLegacyTable`, `LegacyColumnDef`,
   `LegacyFeatures`) rather than rewriting onto the new tree-shakeable
   `features`-based API — that rewrite is real, separable follow-up work,
   not something a dependency-version ticket should also decide.
3. **keycloak-theme island unfrozen** (ADR-001 §D8 exception #1): `vite`
   5→7, `@vitejs/plugin-react` 4→5 (not 6 — 6.x's peer range is `vite ^8`
   only), `storybook`/`@storybook/react`/`@storybook/react-vite` 8→10,
   `keycloakify` 11.9→11.16. Verified directly (`vite build`, `storybook
   build`) since keycloak-theme carries no Nx build/test target.
4. **`zod` 3 → 4**: zero code changes needed anywhere in the repo.
5. **Dead dependency cleanup**: `ts-node`, `ts-loader`, `tsconfig-paths`,
   `source-map-support` removed from both backend apps, the catalog, and
   `.depcheckrc.json`'s ignore list — none was imported, `require`d, or
   `-r`-registered anywhere; `pnpm depcheck` confirms clean. `prettier` also
   dropped from the ignore list (not a dependency anywhere; Biome replaced
   it at MDRS-12).
6. **Security-driven minor bumps**: `next`, `react`/`react-dom`,
   `@opentelemetry/*` (sdk-node, exporter-trace-otlp-grpc,
   auto-instrumentations-node, resources), `pg`/`@types/pg`,
   `class-validator`, `tailwindcss`, `@nestjs/swagger` (patch, pulls a fixed
   transitive `js-yaml`), `nx` + every `@nx/*` (kept in lockstep), `eslint`,
   `typescript-eslint`.
7. **`pnpm.overrides`** for advisories nested below a dependency this
   workspace doesn't declare directly: `uuid`, `nanoid`, `fast-uri`, `qs`,
   `brace-expansion` (two coexisting major lines), `js-yaml` (3.x/4.x lines;
   the 5.x line is separately fixed by the swagger bump), `file-type`,
   `esbuild`. Each entry in `pnpm-workspace.yaml` names its parent and why
   forcing the version is safe.

   Two more entries share that block without belonging to this pass. `multer`
   (MDRS-76) and `smol-toml` (MDRS-79) were carved out and landed on `main`
   first, so an urgent floor was not held behind this branch's review; they
   arrived here through the merge of `main`, bringing the block to **10**.
   They differ in kind from the eight above: those force a version a parent
   *could* have re-resolved to, while these two exist because the parent
   declares an exact string — `@nestjs/platform-express` pins `multer` to
   `"2.2.0"` and `nx` pins `smol-toml` to `"1.6.1"`, in every published
   release including the newest — so no bump reaches them at all.
8. **`audit-ci.json`**: 31-entry allowlist trimmed to the 2 GHSA IDs that
   remain (`xlsx`'s two advisories — see Held back).

**Result**: `pnpm audit --prod` and the full-tree `pnpm audit` both now
report only `xlsx`'s 2 high advisories. Full gate after every commit:
typecheck 16, build 8, test 226/17, lint 16, module-boundaries 16.

Re-measured after merging `main` (the counts above are this branch's own
pre-merge run and are left as the record of it): `pnpm run audit:ci` prints
`Passed pnpm security audit`, with the only findings the two allowlisted
`xlsx` advisories — the first clean run of that gate in this repo. Full gate
on the merged tree: typecheck 16, **test 295 / 21 suites** (tedrisat 293/19,
teskilat 2/2), build 8, lint 16, module-boundaries 16, matching the count
`CLAUDE.md` states.

## Boot verification (Phase 9)

- `tedrisat`/`teskilat`: covered by the existing e2e suite, which boots a
  real NestJS application against a real Postgres (Testcontainers) and
  exercises real HTTP endpoints — stronger evidence than a bare
  `docker compose up` would add.
- `tedris-web`/`nizam-web`/`nazir-web`/`landing-web`: started for real with
  `next start` against the built output and curled; all four answered
  (200/307/308 — the redirects are `next-intl` locale routing, expected).
  Background OTel export errors (`ERR_SSL_WRONG_VERSION_NUMBER` against
  `otlp.medaris.net:4317`) are the sandbox having no route to that host,
  not a regression — the apps kept serving requests regardless.
- `keycloak-theme`: `vite build` and `storybook build` verified directly.
  `keycloakify build`'s jar-assembly step needs Maven, which is not
  installed in this environment — **not exercised, flagged rather than
  assumed**.

## Explicitly out of scope / held back

- **NestJS 11 → 12**: `pnpm outdated` shows this available, but it appears
  in no phase of this ticket's plan and nowhere in ADR-001/MDRS-8 as
  MDRS-21 scope. A NestJS major touches the exact decorator-metadata /
  dependency-injection surface this repo's own CLAUDE.md flags as the
  highest-regression-risk area in the codebase (`useImportType` silently
  breaking DI cost 78/89 tests once already). Treated as a separate,
  dedicated task rather than folded into a version-currency pass.
- **TypeScript 5.9 → 7.0**: held back. `typescript-eslint`'s latest release
  (8.70.0) peers on `typescript: >=4.8.4 <6.1.0` — there is no stable
  TypeScript 6.x (only `6.0.0-dev.*` nightlies; TS skipped straight to the
  native/Go-based 7.0 rewrite), so no released `typescript-eslint` supports
  TS7 yet. Bumping would break `module-boundaries` regardless of the
  Phase 5 decision below. TypeScript is a build-time-only tool with no
  runtime CVE surface, so staying on 5.9.3 (already ADR-endorsed as "the
  last JS-based line") costs nothing on the "secure" half of "latest
  secure stable."
- **Module-boundary mechanism replacement** (dependency-cruiser +
  hand-rolled Nx-graph script instead of `@nx/enforce-module-boundaries` /
  typescript-eslint): not implemented. Per this workspace's own P5 rule,
  adding a new tool/mechanism is a user decision to propose and wait on,
  not something to do unilaterally inside an otherwise-mechanical
  dependency PR. Recommendation, if it becomes needed later specifically to
  unblock a future TS7 attempt: spike it as its own PR, proven with a
  deliberate boundary violation the way the original mechanism was.
- **Node engine floor 22 → 24 / Docker base image lift**: ADR-001 explicitly
  requires "ops sign-off" for this (`node:22-alpine` is what serves
  production traffic today). Not something to change inside a dependency
  PR without that sign-off; flagged for the Linear task, not done.
- **`tools/ci/biome-baseline.json` → `{0,0,0}`**: named in
  `docs/migration/mdrs-12-biome.md` as MDRS-21's job (drive the Biome
  diagnostics ratchet to zero). Not attempted here — it is a
  codebase-wide lint-diagnostics cleanup, an unrelated and much larger unit
  of work from a dependency-version pass, and bundling it into this PR
  would make the diff much harder to review for what it actually changed.
  Left as its own follow-up.
- **`biome migrate` (Biome 2.4.4 → 2.5.x)**: named in the same doc as
  MDRS-21's job. Held back rather than attempted in the same PR as the
  dependency-version work above: the exact pin exists specifically so the
  MDRS-12 bulk-reformat commit stays byte-reproducible in
  `.git-blame-ignore-revs`, and a Biome minor can itself introduce new
  format/lint diagnostics across the whole tree — that risk deserves its
  own PR and its own review, not to ride along with 8 other changes.
- **`.github/dependabot.yaml` migration off `package-ecosystem: npm` + the 3
  dead Dependabot PRs (#6, #7, #8)**: named in
  `docs/migration/mdrs-15-ci-unification.md` as MDRS-21 scope. Not done
  here — closing PRs is a repo-history action better left for the team to
  do deliberately, not something a dependency-upgrade PR should do as a
  side effect.
- **`xlsx@0.18.5`**: unfloorable — no patched npm version of SheetJS exists
  for either advisory. MDRS-8's own FU-5 tracked this as "replace, not
  override." Out of scope for a version-upgrade ticket; needs a product
  decision on a replacement library.
- **Named `vitest` catalog collapse**: `keycloak-theme`'s `vite` now equals
  the `vitest` catalog's `vite` (both `^7.3.6`), so the two-catalog split
  MDRS-20 introduced is no longer load-bearing. Left in place — collapsing
  it means repointing `tedrisat`/`teskilat`'s `catalog:vitest` references
  too, which is a separate mechanical cleanup, not a version decision.

## Corrections to this ticket's own phase plan

- The phase list groups `@vitejs/plugin-react` into "mechanical +1-major"
  bumps separately from `vite` itself. In practice the two are peer-locked
  (plugin-react's major tracks vite's), so they were done together as the
  keycloak-theme island unfreeze; doing plugin-react alone first would have
  meant either breaking the vite 5 pin immediately or picking a
  plugin-react version incompatible with it.
- The phase list's expected test baseline ("91/10 suite") does not match
  what this branch actually runs (226 tests / 17 suites, matching
  CLAUDE.md's documented expectation) — the plan text was stale relative to
  the repo at the time this ticket was picked up.
