# ADR-001: Monorepo Merge — Target Layout, Boundary Taxonomy, and Toolchain

**Status:** Proposed
**Date:** 2026-07-21
**Authors:** Muhammed Taha Ayan
**Issue:** [MDRS-7](https://linear.app/amel-tech/issue/MDRS-7) (epic [MDRS-6](https://linear.app/amel-tech/issue/MDRS-6))

## Context

`amel-tech/madrasah-backend` (npm@10.2.4, Turborepo, NestJS 11: `tedrisat`, `teskilat`, `libs/common`) and `amel-tech/madrasah-frontend` (npm@11.5.2, Turborepo, Next 16 / Vite 5: `tedris`, `nizam`, `nazir`, `landing`, `keycloak-theme`, 11× `shared/*`) merge into this repository, adopting the toolchain already proven in the team's two in-house reference monorepos, called **R1** (the Nx 22.5.2 / Biome / boundary-tags line) and **R2** (the Nx 23.0.0 / Vitest / pnpm-catalog line) throughout this document — their identities are recorded in epic MDRS-6 and deliberately not repeated here. Every other issue in the epic implements what this document decides: the history merge (MDRS-9) rewrites paths into the layout fixed here; the pnpm conversion (MDRS-10) applies the naming fixed here; boundary enforcement (MDRS-13) applies the taxonomy fixed here.

Decisions follow two rules from the epic:

1. **Adopt, don't invent.** Every convention is copied from a reference repo where one exists; deviations are listed in [Corrections & deviations](#corrections--deviations-from-the-epic-text).
2. **The merge changes nothing semantically** (MDRS-21 owns upgrades). One consequence deserves emphasis: **regenerating the lockfile under pnpm is itself a hidden-upgrade event** — every caret range re-resolves. Framework-critical pins below are therefore tilde/exact, not caret.

All claims about the four repos were verified against their working trees on 2026-07-21; upstream versions as of the same date: Nx 23.1.0 (23 = Current, 22 = LTS), Biome 2.5.5, TS 7.0.2 (native compiler, 13 days GA), Node 24 Active LTS / 22 Maintenance, pnpm 11.15.1, Vitest 4.1.10, NestJS 11.1.28 (ships Vitest as its default runner), Next 16.2.10.

## Decision

### D1. Directory layout — flat `libs/`, identity `apps/` paths

Apps keep their current directories. All 12 libs move to a **flat `libs/<name>`** — the taxonomy lives in Nx tags (D5), never in directory depth.

```
amel-tech/medaris
├── apps/
│   ├── tedrisat/          # NestJS education service :3001      @medaris/tedrisat
│   ├── teskilat/          # NestJS org service (stub) :3002     @medaris/teskilat
│   ├── tedris/            # Next 16 talebe portal :4000         @medaris/tedris-web
│   ├── nizam/             # Next 16 köşk/course mgmt :4001      @medaris/nizam-web
│   ├── nazir/             # Next 16 admin (stub) :4002          @medaris/nazir-web
│   ├── landing/           # Next 16 landing :4003               @medaris/landing-web
│   └── keycloak-theme/    # Keycloakify 11 + Vite 5 jar         @medaris/keycloak-theme
├── libs/
│   ├── common/            # scope:server platform:node type:infra   BUILT (tsc→dist)
│   ├── ui/                # scope:ui     platform:web  type:ui      source
│   ├── icons/             # scope:ui     platform:web  type:ui      source
│   ├── tokens/            # scope:ui     platform:web  type:ui      BUILT (CSS codegen)
│   ├── hooks/             # scope:ui     platform:web  type:util    source
│   ├── services/          # scope:web    platform:web  type:data-access  source
│   ├── i18n/              # scope:shared (no platform) type:i18n    source
│   ├── types/             # scope:shared (no platform) type:types   source
│   ├── utils/             # scope:shared (no platform) type:util    source
│   ├── mocks/             # LANDING PATH ONLY — deleted in MDRS-10
│   ├── eslint-config/     # LANDING PATH ONLY — dissolved into root configs in MDRS-10
│   └── typescript-config/ # LANDING PATH ONLY — dissolved into root tsconfig in MDRS-10
├── docs/
│   ├── adr/               # README.md (index + template) + NNN-*.md
│   ├── PRD.md             # pre-existing, canonical — must survive the merge
│   └── ecosystem-boundaries.md   # pre-existing, canonical — must survive the merge
├── .github/workflows/     # ci.yml, ci-dev.yml, release-please.yml, 7 deploy workflows, codeql.yml
├── .husky/                # pre-commit: lint-staged (biome); commit-msg: commitlint
├── biome.json             # modelled on R1: 2-space, 80 width, organizeImports, vcs.useIgnoreFile
├── eslint.config.mjs      # boundaries-ONLY (see D5)
├── nx.json                # @nx/eslint targetName "module-boundaries"; lint = biome; analytics:false
├── package.json           # @medaris/source, private, packageManager pnpm@11.4.0
├── pnpm-workspace.yaml    # explicit enumeration + catalog + allowBuilds + verifyDepsBeforeRun: warn
├── tsconfig.base.json     # strict, NodeNext; NO paths aliases
├── tsconfig.json          # solution-style TS project references
├── vitest.config.ts       # root unit config (R2-mirrored)
├── vitest.integration.config.ts   # *.integration.test.ts, fileParallelism:false
├── commitlint.config.mjs  # scope-enum: 7 components + lib names + repo/deps/ci/docs
├── release-please-config.json     # 7 components, include-component-in-tag:true, NO extra-files
├── .release-please-manifest.json  # explicit union bootstrap (see D11)
├── .nvmrc                 # 24
└── .git-blame-ignore-revs # bulk Biome reformat commit (MDRS-12)
```

**Reserved names — docs-only, create nothing now** (no empty dirs, no `.gitkeep`; a comment block in `pnpm-workspace.yaml` mirrors this list):

- `apps/muhasebe` — P4 donations service (PRD M16). Adding it = pnpm-workspace line + release-please-config component + manifest entry + commitlint scope, in one PR (D10's procedure).
- `apps/e2e` — future E2E suite (R1 precedent, `scope:app` + `type:e2e`).
- `apps/web`, `apps/docs` — **claimed by the future `medaris-web` (GitLab) absorption. Nothing may take these names before then.**
- `libs/errors`, `libs/validation`, `libs/config` — the anticipated `common` split (MDRS-13 names them).
- `libs/mocks` — name freed after deletion; a future MSW/faker package may re-use it.
- P2 notification workers and the SRS scheduler land **inside** `apps/teskilat` / `apps/tedrisat` per the PRD's modular-monolith rule — no new apps or libs.

Rejected: R1/R2's layered `libs/<layer>/<name>` (see [Alternatives](#alternatives-considered)). Flat wins on merge mechanics (D2) and kills the degenerate `libs/ui/ui` path outright; R2's flat `libs/ui` is in-house precedent that flat works under `@nx/enforce-module-boundaries`. If the repo ever reaches R1's ~21-lib scale, re-layering is an ordinary `git mv` commit far away from the history-rewrite window.

### D2. Path rewrite rules for the history merge (MDRS-9)

**Exactly one non-identity rewrite rule.**

| Source | Rule |
| -- | -- |
| madrasah-backend `apps/*` | identity |
| madrasah-backend `libs/common` | identity |
| madrasah-frontend `apps/*` | identity |
| madrasah-frontend `shared/*` | **→ `libs/*`** (single prefix rule) |

`mocks`, `eslint-config`, and `typescript-config` land at `libs/<name>` via the same rule purely to preserve history (`git log --follow -- libs/mocks` keeps working after deletion). They are **never enumerated in `pnpm-workspace.yaml`** and never become Nx projects.

**Merge-commit collision runbook** — every path both repos (or medaris itself) own. None may be silently dropped; the resolution for root config is "take neither — the new root is authored fresh by MDRS-10/12/15/17":

- `.github/workflows/`: `ci-dev.yaml`, `codeql.yaml`, `pull-request.yaml`, `release-please.yaml`
- `package.json`, `package-lock.json`, `tsconfig.json`, `turbo.json`
- `release-please-config.json`, `.release-please-manifest.json` (merged per D11, not taken from either side)
- `commitlint.config.js`, `.husky/`, `.gitignore`, `.mcp.json`, `README.md` (`.claude/` from MDRS-9's list is untracked everywhere — no git collision; keep-local reminder only)
- **`docs/PRD.md` and `docs/ecosystem-boundaries.md`** — madrasah-backend holds only **untracked working-tree copies** (never committed on any branch — verified), so no merge collision arises from git; **medaris's committed versions are canonical and must survive untouched**. Backend's tracked `docs/SECURITY_AUDIT.md` rides along conflict-free.
- `.github/pull_request_template.md` — tracked by **both** repos, byte-identical today (auto-merges); take either, re-verify at merge time.

Git tags from both repos ride along with the history; tag migration is explicit MDRS-9 scope (D11 depends on it).

### D3. The seven apps

`Nx project = release-please component = commitlint scope = Docker image suffix = tag prefix`. Only the directory keeps the short Ottoman-Turkish name. A volunteer goes from `fix(tedris-web): …` to `nx test tedris-web` to tag `tedris-web-v*` with no lookup table.

| Dir (unchanged) | Package | Nx project / component / commit scope | Tags | Version carried |
| -- | -- | -- | -- | -- |
| `apps/tedrisat` | `@medaris/tedrisat` | `tedrisat` | `scope:app, platform:node, type:app` | 0.1.5 |
| `apps/teskilat` | `@medaris/teskilat` | `teskilat` | `scope:app, platform:node, type:app` | 0.1.1 |
| `apps/tedris` | `@medaris/tedris-web` | `tedris-web` | `scope:app, platform:web, type:app` | 1.9.0 |
| `apps/nizam` | `@medaris/nizam-web` | `nizam-web` | `scope:app, platform:web, type:app` | 0.1.12 |
| `apps/nazir` | `@medaris/nazir-web` | `nazir-web` | `scope:app, platform:web, type:app` | 0.1.6 |
| `apps/landing` | `@medaris/landing-web` | `landing-web` | `scope:app, platform:web, type:app` | 1.2.0 |
| `apps/keycloak-theme` | `@medaris/keycloak-theme` | `keycloak-theme` | `scope:app, platform:web, type:app` | 1.4.0 |

Notes:

- `keycloak-theme` renames from `madrasah-keycloak-theme` (brand purge) and gains the `private: true` it alone lacks. Its component/tag was **already** decoupled from its package name today, so the rename is provably release-safe. Its Vite 5.4.21 + Keycloakify 11.9.6 island is deliberately frozen through the merge (D8) — the jar + SSH deploy is the most fragile pipeline we have. If MDRS-11 registers `@nx/vite` inference (23.0.0), it must verify the plugin tolerates this app's Vite 5 config or exclude `apps/keycloak-theme` from the plugin until MDRS-21 — no design or reference covers that pairing. Per the ecosystem charter (§4/§6), a future shared "Amel One" theme can neither live in this repo nor be imported from a sibling — it would be a new org-level artifact (escalated).
- `tedris` fixes at MDRS-10: `@medaris/services` promoted devDependency → dependency (33 runtime imports; a pruned production install would crash today); dead `hooks`/`types` declarations dropped.
- `landing`/`nazir` gain explicit `transpilePackages` (today they build only via Turbopack auto-transpilation — masked, not working-by-design).
- Each app carries a `project.json` with `name` + `tags` (the scoped package name is not the Nx project name).

### D4. The twelve libs

| Current | Target | Package | scope | type | platform | Disposition |
| -- | -- | -- | -- | -- | -- | -- |
| BE `libs/common` | `libs/common` | `@medaris/common` | `scope:server` | `type:infra` | `platform:node` | **live** — 1:1 move; split later |
| FE `shared/ui` | `libs/ui` | `@medaris/ui` | `scope:ui` | `type:ui` | `platform:web` | **live** — declare its `tokens` dep |
| FE `shared/icons` | `libs/icons` | `@medaris/icons` | `scope:ui` | `type:ui` | `platform:web` | **live** |
| FE `shared/tokens` | `libs/tokens` | `@medaris/tokens` | `scope:ui` | `type:ui` | `platform:web` | **live** — keeps CSS codegen build |
| FE `shared/hooks` | `libs/hooks` | `@medaris/hooks` | `scope:ui` | `type:util` | `platform:web` | **live** — zero imports today; dist build dropped |
| FE `shared/services` | `libs/services` | `@medaris/services` | `scope:web` | `type:data-access` | `platform:web` | **live** — OpenAPI client; `generate` becomes an Nx target |
| FE `shared/i18n` | `libs/i18n` | `@medaris/i18n` | `scope:shared` | `type:i18n` | *(none)* | **live** — dist build dropped; server-side use (P2 emails) already legal |
| FE `shared/types` | `libs/types` | `@medaris/types` | `scope:shared` | `type:types` | *(none)* | **live** — zero imports today; future contracts slot |
| FE `shared/utils` | `libs/utils` | `@medaris/utils` | `scope:shared` | `type:util` | *(none)* | **live** |
| FE `shared/mocks` | `libs/mocks` | — | `scope:web` | `type:testing` | `platform:web` | **delete after merge** — no committed source (`main` → missing `src/index.js`); strip tedris/nizam devDeps + nizam `transpilePackages` atomically; P2 re-decides mock strategy |
| FE `shared/eslint-config` | `libs/eslint-config` | — | `scope:shared` | `type:tooling` | *(none)* | **dissolve into root** `biome.json` + `eslint.config.mjs` (MDRS-10/12, locked). Its deletion also evicts `eslint-config-next` and the stray hoisted Next 15.4.6 |
| FE `shared/typescript-config` | `libs/typescript-config` | — | `scope:shared` | `type:tooling` | *(none)* | **dissolve into root** `tsconfig.base.json`; its `PROPRIETARY` license oddity dies with it |

`common` notes: it is the **only tsc-built lib** (composite → `dist/`, `main: dist/index.js`) and **stays built** at merge — the backend keeps `nest build` (plain tsc), and tsc cannot compile raw TS reached through a `node_modules` symlink; flipping it to source consumption requires a bundler change, which is deferred (MDRS-21 candidate: R1's `@nx/webpack` pattern). Its internal classes are already named `Medaris*` (`MedarisError`, `MedarisResponse`), so the rename touches only the package name. Contents cluster into contracts (DTO/response/error types) vs NestJS infra (auth-guard/JWKS, bootstrap, pino/winston logger, pipes, excel) — the split into `libs/errors` / `libs/validation` / `libs/config` (+ contracts) is an ordinary post-merge PR, **not** merge-window work. Until then web code cannot reach those types (`scope:server` + `platform:node`) — correct, since `services`' generated client carries the wire types. `@types/multer` moves from runtime deps to devDeps.

### D5. Boundary taxonomy — MDRS-13 confirmed, with amendments

Two **enforced** axes (`scope`, `platform`) + one **documentary** axis (`type`). MDRS-13's vocabulary is kept; four amendments are forced by verified edges or by `@nx/enforce-module-boundaries` semantics:

1. `scope:ui → scope:ui` allowed (real edges: `ui→icons` 8 imports, `ui→tokens` CSS). A rule that is false on day one teaches people to sprinkle `eslint-disable`.
2. `scope:web → scope:web` allowed (mocks→services was a real edge; future composition).
3. `scope:shared → scope:shared` allowed (the anticipated `errors`/`validation` composition must not need an ADR amendment).
4. Platform isolation uses **`notDependOnLibsWithTags`**, never a positive list: `onlyDependOnLibsWithTags` fails any dependency on an *untagged* lib, and `scope:shared` libs deliberately carry no platform tag (MDRS-13 lock). Per-platform app narrowing uses **`allSourceTags`** (AND semantics). All matching constraints apply cumulatively.

| sourceTag | may depend on |
| -- | -- |
| `scope:shared` | `scope:shared` |
| `scope:ui` | `scope:ui`, `scope:shared` |
| `scope:web` | `scope:web`, `scope:ui`, `scope:shared` |
| `scope:server` | `scope:server`, `scope:shared` |
| `scope:app` (fallback) | `scope:ui`, `scope:web`, `scope:server`, `scope:shared` |
| `scope:app` + `platform:web` | `scope:ui`, `scope:web`, `scope:shared` |
| `scope:app` + `platform:node` | `scope:server`, `scope:shared` |
| `platform:web` | **not** `platform:node` |
| `platform:node` | **not** `platform:web` |

App→app imports are banned by construction (`scope:app` appears in no allowed list). **Every app must carry exactly one `platform:*` tag** — a review-checklist rule, since depConstraints cannot express "tag is mandatory"; an untagged app silently falls back to the permissive generic `scope:app` rule. (The stricter alternative — omitting the generic rule so an untagged app matches no constraint and fails closed — is documented here as an option MDRS-13 may adopt if the checklist proves insufficient.) The exact `depConstraints` (this JSON is normative for MDRS-13):

```json
[
  { "sourceTag": "scope:shared", "onlyDependOnLibsWithTags": ["scope:shared"] },
  { "sourceTag": "scope:ui", "onlyDependOnLibsWithTags": ["scope:ui", "scope:shared"] },
  { "sourceTag": "scope:web", "onlyDependOnLibsWithTags": ["scope:web", "scope:ui", "scope:shared"] },
  { "sourceTag": "scope:server", "onlyDependOnLibsWithTags": ["scope:server", "scope:shared"] },
  { "sourceTag": "scope:app", "onlyDependOnLibsWithTags": ["scope:ui", "scope:web", "scope:server", "scope:shared"] },
  { "allSourceTags": ["scope:app", "platform:web"], "onlyDependOnLibsWithTags": ["scope:ui", "scope:web", "scope:shared"] },
  { "allSourceTags": ["scope:app", "platform:node"], "onlyDependOnLibsWithTags": ["scope:server", "scope:shared"] },
  { "sourceTag": "platform:web", "notDependOnLibsWithTags": ["platform:node"] },
  { "sourceTag": "platform:node", "notDependOnLibsWithTags": ["platform:web"] }
]
```

**Every known dependency edge, classified** (MDRS-13's implementation checklist):

| Edge | Verdict |
| -- | -- |
| `ui → tokens` (CSS `@import`) | legal once **declared** — the CSS import is invisible to ESLint; the real enforcement is the declared dep + pnpm strict `node_modules` |
| `ui → icons` | legal (declared; ui→ui) |
| `tedris-web → services` | legal once promoted devDep → dependency |
| `keycloak-theme → icons` | legal once **declared** (undeclared today) |
| `tedrisat/teskilat → common` | legal (app+node → server) |
| `tedris-web → ui/icons/tokens/hooks/i18n/utils/types` | legal |
| `nizam-web → ui/icons/services/i18n/utils` | legal (app+web → ui/web/shared) |
| `landing-web → ui/icons/i18n` | legal |
| `nazir-web → ui` | legal (declared, currently unimported — kept) |
| `keycloak-theme → ui` | legal (declared) |
| `mocks → services`, `tedris-web/nizam-web → mocks` (devDeps) | moot (mocks deleted) |
| any `app → app` | violation by construction |
| any web lib → `common` | violation — protects the future contracts split; web code waits for `libs/errors`/`validation` in `scope:shared` |

**Wiring** (R1-verbatim, one adjudicated name):

- Target name: **`module-boundaries`** via `@nx/eslint/plugin` `options.targetName` in `nx.json` — R1's real, CI-proven name. The epic/MDRS-13 draft said `boundaries`; proven wiring and existing muscle memory outrank draft prose (epic text amended).
- `lint` = Biome: `targetDefaults.lint` = `nx:run-commands` `biome check {projectRoot}`, cached, inputs `[default, {workspaceRoot}/biome.json]`.
- Root `eslint.config.mjs` = `nx.configs['flat/base']` + `@nx/enforce-module-boundaries` at `error` with `{ enforceBuildableLibDependency: true, allow: [], depConstraints: <above> }`; `linterOptions.reportUnusedDisableDirectives: "off"` (MDRS-12). It opens with R1's comment: *"ESLint is used ONLY for Nx module boundary enforcement. All other linting and formatting is handled by Biome."*
- `enforceBuildableLibDependency` is safe: both buildable libs (`common`, `tokens`) have zero internal deps.
- CI: `pnpm exec nx affected -t test build typecheck module-boundaries` (base via `nrwl/nx-set-shas`). `nx.json` `sharedGlobals` includes `.github/workflows/ci.yml` **and `{workspaceRoot}/vitest.config.ts`** (R2's #285 stale-cache lesson). `analytics: false`.
- **Sequencing rule (hard ordering):** land code (MDRS-9) → rewire/delete transient packages (MDRS-10) → reformat (MDRS-12) → **only then** enable `module-boundaries` (MDRS-13). Enabling earlier makes every app fail against the untagged `eslint-config`/`typescript-config`/`mocks` corpses.
- The tag table lands in `CLAUDE.md` **in the same PR that applies the tags** (MDRS-13 deliverable, not a nice-to-have), with a one-screen mirror in `CONTRIBUTING.md`. Neither reference documents its taxonomy in prose (R2 buries it in eslint comments); we do better.
- `type:*` carries no constraints at merge. A `type:testing → everything-below-app` rule is pre-approved for when a real testing lib or `apps/e2e` appears.

### D6. Package naming — `@medaris/*` everywhere, `private: true` everywhere

- **Libs:** `@medaris/<dirname>` — flat dirs make package suffix = directory = Nx project name. Codemod is a mechanical 1:1 `@madrasah/X → @medaris/X` (import-specifier shape unchanged).
- **Apps:** `@medaris/<release-component>` (`@medaris/tedris-web`, `@medaris/tedrisat`). This deviates from MDRS-10's letter ("apps keep bare names, matching the references") because its premise is false — **both** reference repos scope their app packages under their npm org scope. Following MDRS-10's actual rationale (match the references) means scoping. Cost is ~7 `package.json` `name` fields; nothing imports apps. Release components and tags are untouched: release-please's per-path `component` config is independent of the package name.
- **Root:** `@medaris/source`, `private: true` (R1 pattern).
- **`private: true` on every workspace package.** Fixes today's mess: `keycloak-theme` missing the field; `hooks`/`types`/`utils` carrying `publishConfig.access: public`; `icons`/`tokens`/`services` publishable-shaped. Nothing publishes to npm — artifacts are Docker images (GHCR) and the Keycloak jar. Revisited only by the OQ-1 license decision.
- Internal deps: `workspace:*`. Lib versions: `0.0.0`. App versions: carried from the release manifests (D3 table).
- commitlint `scope-enum`: `[tedrisat, teskilat, tedris-web, nizam-web, nazir-web, landing-web, keycloak-theme, common, ui, icons, tokens, hooks, services, i18n, types, utils, repo, deps, ci, docs]` — a superset of the 7 locked component names (MDRS-17 AC).

### D7. Lib consumption model — source-consumed, two built exceptions

Default (R1/R2-verbatim): `main: ./src/index.ts`, `workspace:*`, **no tsconfig `paths` aliases anywhere**, TS project references for typecheck, and **explicit `transpilePackages`** in all four Next apps.

Exceptions, both with zero internal deps:

1. `@medaris/common` — stays **tsc-built** (see D4; backend keeps `nest build` at merge).
2. `@medaris/tokens` — keeps its **CSS codegen build** (`input/main.css` → `theme/main.css` + JS export), declared as an Nx build target with outputs so consumers' `dependsOn: ^build` and caching are correct.

`hooks`, `types`, `utils`, `i18n` drop their tsc/esbuild dist builds at MDRS-10. **Fallback clause:** any one lib may temporarily keep its build without violating this ADR (the exception list just grows by one, documented) — this caps the blast radius of the dist→source flip.

### D8. Toolchain versions

Single pnpm `catalog:` is the source of truth (MDRS-8 fills the long tail; these entries are normative). Pin style is deliberate: **tilde/exact for framework-critical existing deps** (the lockfile-regeneration rule from Context), caret acceptable for newly-introduced tooling.

| Tool | Pin | Justification vs R1 (22.5.2 line) / R2 (23.0.0 line) / upstream |
| -- | -- | -- |
| nx + all `@nx/*` | **23.0.0 exact** | R2's proven pin, incl. `@nx/vitest` — the exact stack MDRS-20 mandates. R1's 22.5.2 is LTS/feature-frozen (books a guaranteed second migration) and its backend proof is Jest-shaped. 23.1.0 is unproven in-house. Spike must verify `@nx/js` 23.0.0 accepts TS 5.9 (in-house proof is diagonal: R1 Nx22+TS5.9, R2 Nx23+TS6.0). |
| typescript | **~5.9.3** | Both source repos already resolve 5.9.x → zero merge delta; R1 proves 5.9 under Nx+Biome+boundaries. R2's ~6.0.3 exists to appease typescript-eslint peer caps we barely use; TS 7.0.2 is two weeks GA. 5.9 is the last JS-based line, so tilde ≈ frozen. |
| Node (`.nvmrc`) | **24** | One Node across R1/R2/medaris laptops; 24 is Active LTS (EOL 2028-04), 22 already Maintenance. Plain `24`, not `lts/krypton` — the codename means nothing to newcomers and already caused an engines-mismatch smell in R2. |
| Node (engines) | **`>=22`** | **Prod Docker images stay `node:22-alpine` through the merge** — the runtime serving real users does not change in the same window as pnpm+layout+test-runner. A `>=24` floor would fail `pnpm install` inside those images. Floor rises with the MDRS-21 base-image lift. |
| `@types/node` | **^22** | Pinned to the **prod** floor, not dev Node: any 24-only API fails typecheck before it crashes a 22-alpine container. Bumps to ^24 with the image lift. (R1's ^25 / R2's ^26 type ahead of every runtime they run — not copied.) |
| packageManager | **`pnpm@11.4.0`** + engines `pnpm >=11.0.0` | MDRS-7 requires a value; **neither reference sets one** (R2: engines `>=11` + CI pin 11.4.0; R1: nothing). Corepack pinning exceeds both deliberately. 11.4.0 is what R2's CI proves daily against Nx 23 + catalog + `onlyBuiltDependencies`; 11.15.1 is newer but unproven in-house. |
| `@biomejs/biome` | **2.4.4 exact** | R1's proven version — its `biome.json` copies with zero schema migration. Exact (not R1's `^2.4.4`) because the MDRS-12 bulk-reformat commit goes into `.git-blame-ignore-revs` and must be byte-reproducible; a fresh lockfile would float the caret to 2.5.5. `biome migrate` upgrade = MDRS-21. |
| eslint / typescript-eslint | **^10.5.0 / ^8.62.0** | R2's pairing, proven with `@nx/eslint-plugin` 23.0.0. Boundaries-only surface. TS 5.9 sits inside typescript-eslint 8's peer range with no overrides. |
| vitest (+ coverage-v8, ui) | **^4.1.9** | R2-verbatim; MDRS-20 mirrors R2's root configs, same version removes a variable. NestJS 11's default runner targets this line. |
| unplugin-swc + `@swc/core` | `@swc/core` **~1.15.43**; unplugin-swc exact pin chosen at the MDRS-20 spike | Required for `emitDecoratorMetadata` under Vitest for NestJS. No in-house precedent exists (verified: neither reference uses it) — the pin is fixed by the spike, not invented here. |
| `@nestjs/*` | **~11.1.19** | Backend's locked version as the floor; tilde blocks minor/major jumps. Patch drift within 11.1.x (up to today's 11.1.28) **will** land at lockfile regeneration and is accepted — it matches the backend's existing declared range (`^11.1.5`), which already floats patches. |
| next | **~16.1.6** | What all four apps have installed and deploy today. Tilde because the declared `^16.1.6` would silently become 16.2.10 on fresh pnpm resolution — the merge must not smuggle a framework minor. |
| react / react-dom | **~19.1.1** | Installed today. Aligning to R1/R2's ^19.2.4 is a one-line MDRS-21 bump. |
| tailwindcss | **~4.1.13** | Installed today (v4 line everywhere). |
| drizzle-orm / drizzle-kit | **^0.45.2 / ^0.31.4** | Backend's declared line; equals R2's 0.45.2 — the two proofs agree. (0.x carets are patch-ranges.) |
| `@opentelemetry/sdk-node` | **^0.208.0** | Resolves the tedrisat(^0.207)/teskilat(^0.208) drift upward to the already-declared higher value. |
| husky / lint-staged / commitlint | **^9.1.7 / ^17.0.8 / ^21.0.2** | R2 catalog set; lint-staged runs R1's `biome check --write --no-errors-on-unmatched` on staged files. Replaces the backend's heavy pre-push (full build+test) and both repos' branch-name-regex hooks (not a reference convention). |
| vite + keycloakify | **~5.4.21 / ~11.9.6, pinned in `apps/keycloak-theme` only** | Catalog **exception #1**: the theme cannot share a modern vite line without destabilizing the fragile jar+SSH pipeline mid-merge. R1's keycloakify 11.15 / vite 7 combo is the proven MDRS-21 destination. |
| zod | **~3.25.76** (catalog) — *pending escalation* | Catalog **exception #2 candidate**: apps run v3; only `@medaris/ui` declares ^4. Recommendation: pin 3 and port ui — but whether ui uses v4-only APIs needs a 30-minute code check before MDRS-10 executes (escalated). If porting is expensive, zod stays a documented per-package exception until MDRS-21. |

Docker base images: **hold `node:22-alpine`** (and rewrite `npm install` → `pnpm install --frozen-lockfile` in MDRS-16); lift to `node:24-alpine` in MDRS-21 under ops sign-off. The keycloak-theme deploy workflow's Node 18 is bumped to 24 in MDRS-16 (build-time only; jar output unchanged).

### D9. Test runner — Vitest everywhere, stated honestly

The epic locks Vitest for all tests, and this ADR keeps the lock — but corrects the epic's justification: **"both reference repos run Vitest" is false.** R1's own ADR 001 deliberately chose **Jest ^30 for its NestJS backend** (`apps/api`, `apps/e2e`); Vitest covers only its Vite frontends. R2's Vitest proof is **Fastify**, not NestJS. Medaris will be the house's first Vitest-on-NestJS deployment.

The lock survives on current facts R1 didn't have in February: NestJS 11 now ships Vitest as its default runner; R2 proves Vitest 4 + Nx 23 mechanics in CI, and its testcontainers unit/integration split is proven **locally** (root `test:integration` script + infra-db's `test-integration` target) though R2's CI never exercises the integration config — medaris CI must wire it itself (MDRS-15/20); `unplugin-swc` supplies the `emitDecoratorMetadata` that esbuild cannot (the transposition of R1's `@swc/jest` rationale). One runner = one coverage gate, one watch mode, one mental model.

Shape (R2-verbatim): root `vitest.config.ts` (unit; excludes `*.integration.test.ts`; v8 coverage thresholds) + `vitest.integration.config.ts` (`*.integration.test.ts` only, `fileParallelism: false`, testcontainers timeouts); per-project configs `mergeConfig` the root with `root` pinned to the project dir (R2's #285 fix). tedrisat's Jest settings map: `maxWorkers: 1` → `fileParallelism: false`, `globalTeardown` → `globalSetup`/teardown hooks, 60s timeouts → `testTimeout`/`hookTimeout`.

**MDRS-20 must spike tedrisat's testcontainers suite first**; per-app conversion proceeds only after the spike passes, with test counts reconciled per app. If the spike fails hard, a temporary Jest carve-out for tedrisat contradicts the epic lock and needs a team decision (escalated).

### D10. Release & commit continuity (MDRS-17)

- release-please (`googleapis/release-please-action@v4.3.0`, unchanged) with **exactly the 7 locked components** (D3), `include-component-in-tag: true`, `separate-pull-requests: true`, `$schema` added.
- `.release-please-manifest.json` is **explicitly bootstrapped** as the union of both repos' manifests at current versions (D3 table) — the history rewrite changes every SHA and orphans old tag anchors, so versions must not be re-derived.
- **Run a local release-please dry run against the merged history before the first real release** — a mis-parse would mint wrong versions across all 7 components.
- The `extra-files: ["shared/**"]`/`["libs/**"]` hack is **dropped**: `extra-files` is a version-string-replacement feature, not change detection — the behavior both repos think they have does not exist. Consequence (escalated to the release owner): lib-only commits no longer implicitly trigger app releases; a lib fix that should ship an app gets a commit scoped to that app.
- Adding `muhasebe` later = pnpm-workspace line + release-please-config component + manifest entry + commitlint scope, in one PR (documented procedure; same list as D1).

### D11. Workspace registration & catalog governance (MDRS-10)

`pnpm-workspace.yaml`:

- **Explicit enumeration, no globs** — all 16 packages: the 7 apps + `libs/{common, ui, icons, tokens, hooks, services, i18n, types, utils}`. An unregistered package fails loudly (MDRS-10's stated preference; the transient landing dirs are structurally non-registrable).
- Single default `catalog:` for every shared external version; internal deps `workspace:*`.
- `verifyDepsBeforeRun: warn` (R2-documented pnpm-11 non-TTY footgun).
- R2's supply-chain governance adopted: `onlyBuiltDependencies`/`allowBuilds` explicit per native dep (approve `@swc/core`, `esbuild`, `nx`, `lightningcss`/`@tailwindcss/oxide`, `unrs-resolver`; deny watchers by default; MDRS-8 extends the list strictly per dep that actually exists — no speculative entries) + security-floor `overrides` where deps overlap. This matches the hassasiyet-form dependency-vetting culture.
- `pnpm.packageExtensions` is the escape hatch for third-party packages with broken manifests — never for our own.

### D12. ADR practice (this document's own format)

R2's format is adopted as the Medaris standard: `docs/adr/NNN-kebab-slug.md`, `# ADR-NNN: Title`, bold **Status/Date/Authors**, sections Context / Decision / Alternatives Considered / Consequences (Positive/Negative/Neutral) / Related, **plus `docs/adr/README.md` holding the index table and the canonical copy-paste template**. (Provenance note: Alternatives Considered comes from R2's ADR practice — e.g. its ADR-002 — not its README template; we promote it into the template.) Two amendments: a multi-decision ADR may structure `## Decision` as `### D<n>` subsections, and an ADR may add an **Issue:** metadata line plus extra H2 sections (e.g. Escalations, Corrections) between Consequences and Related when the decision warrants them — this ADR is the precedent for all three. Post-hoc annotations via blockquotes with cross-links (R2 ADR-002 precedent). ADR one-liners are additionally indexed in the future root `CLAUDE.md` (R1 practice worth keeping). PRD Phase-1 requires an ADR practice; this is it.

## Alternatives Considered

### Layered `libs/<layer>/<name>` directories (R1/R2 shape)

Rejected for the merge. It costs ~12 per-package `git-filter-repo` rules (vs one), creates the degenerate `libs/ui/ui` path (forcing a rename or an outlier), and R1's own history shows layered naming decays into outliers (three of its libs have directory, package, and project names that disagree). Tags — not directories — are the enforcement mechanism (MDRS-13). Re-layering later is an ordinary `git mv` far from the rewrite window.

### R1's 6-scope taxonomy (`client` + reserved `core`/`infra`)

Rejected. It discards the team-reviewed MDRS-13 vocabulary for cross-repo symmetry, and its reserved-but-empty `core`/`infra` layers reproduce exactly the R1 debris pattern this ADR refuses to copy (empty `libs/nestjs/*` glob, aspirational `scope:nestjs`, stale plugin excludes). `scope:core` also quietly contradicts the PRD's modular-monolith rule ("extract only on demonstrated need"). If server-side libs multiply, new scopes are additive.

### Nx 22.5.2 (R1's line)

Rejected: 22 is LTS/feature-frozen, so starting a *new* workspace on it books a guaranteed 22→23 major hop into MDRS-21 (double migration), and MDRS-20's mandated Vitest pattern is in-house-proven only on 23 (`@nx/vitest` does not exist on 22). The cost accepted: `nx.json` is R2-shaped rather than byte-copied from R1.

### Bare unscoped app package names (MDRS-10's literal text)

Rejected — the cited premise ("matching R2") is false; both references scope their apps. Scoping costs 7 `name` fields, and per-path `component` config keeps every tag namespace intact.

### `boundaries` as the target name (epic/MDRS-13 literal text)

Rejected in favor of R1's CI-proven `module-boundaries`. Renaming a working pattern to match draft prose is negative-value churn; the epic text is amended instead.

### TS ~6.0.3 (R2) or 7.0.2 (upstream); Node 24 images at cutover; pnpm 11.15.1; Biome 2.5.5

All rejected as merge-window risk with no merge benefit; each is first-candidate MDRS-21 work. Node images especially: the production runtime must not change in the same window as package manager + layout + test runner.

### Splitting `libs/common` during the migration

Rejected: splitting is content surgery that breaks MDRS-9's mechanical property and adds review surface mid-merge. Both consumers import via the barrel, so the later split is a re-export exercise.

## Consequences

### Positive

- MDRS-9 shrinks to **one** non-identity rewrite rule + an enumerated collision runbook; app paths, release components, tag namespaces, and deploy pipelines survive byte-identical.
- One name per app end-to-end (commit scope = nx project = component = tag = image) — tuned for a part-time team where one contributor holds 56% of frontend commits.
- The boundary rules are true on day one: every known edge is either legal-once-declared or a named violation with a named fix; the platform axis mechanically stops server code reaching browser bundles — the property the monorepo exists to provide.
- Zero hidden **minor/major** upgrades: tilde/exact pins make "the merge changed nothing" survive fresh pnpm resolution (accepted residue: patch drift where tilde admits it, e.g. `@nestjs/*` 11.1.19→11.1.28); production runtime untouched.
- Every PRD deliverable (muhasebe, workers, SRS, e2e, medaris-web) has a named landing slot requiring no re-layout — reservations without committed rot.

### Negative

- Flat `libs/` gives no directory-level layer hints — the CLAUDE.md/CONTRIBUTING tag table is a hard deliverable, not documentation garnish.
- Dev/CI on Node 24 vs prod on 22 until MDRS-21 — guarded by `@types/node ^22` + engines floor, but it is a rule volunteers must be told about.
- First in-house Vitest-on-NestJS: R1's backend-test recipes do not transfer; MDRS-20 carries genuine spike risk.
- Two built-lib exceptions (`common`, `tokens`) complicate the "libs have no build" teaching line; documented next to the tag table.
- Nx 23.0.0 + TS 5.9 is proven only diagonally in-house; the bootstrap spike must confirm the peer range.
- Lib-only commits stop triggering app releases once the `extra-files` hack dies — a real release-policy change requiring sign-off.

### Neutral

- `apps/tedris` hosting `tedris-web` (dir ≠ component) is a pre-existing mismatch, now frozen for tag continuity.
- R1 and medaris now differ on Nx major and lib-directory shape; both differences are recorded here and re-convergeable at MDRS-21 if wanted.
- The `@madrasah/*` → `@medaris/*` codemod plus `Medaris*`-named internal classes completes a brand rename the backend code already half-did.

## Escalations — team decisions this ADR cannot make

1. **zod 3 vs 4** (D8): needs the 30-minute ui-API check before MDRS-10 executes.
2. **Release-policy change** (D10): lib-only commits no longer release apps — release owner must confirm.
3. **License / OQ-1**: the MDRS-10 codemod touches every `package.json` exactly once — the AGPL-apps/permissive-libs decision should ride that diff or all packages stay `UNLICENSED`+private pending the call (owner: Hadis ve Siyer Medresesi).
4. **Node 24 image lift scheduling** (MDRS-21): Coolify/VPS owner books the runtime window per service.
5. **Vitest-on-NestJS fallback authority**: if the MDRS-20 spike fails hard, who may grant a temporary tedrisat Jest carve-out (contradicts the epic lock)?
6. **medaris-web absorption timing**: confirm post-cutover so the `apps/web`/`apps/docs` reservation holds.
7. **Amel One shared Keycloak theme**: charter §4/§6 forbids cross-project code imports — a shared theme means a new org-level artifact, not a lib here. Needs istişare.

## Corrections & deviations from the epic text

Recorded so MDRS-9..21 implement from accurate premises:

| Where | Claim | Correction |
| -- | -- | -- |
| MDRS-6 / MDRS-20 | "Both reference repos run Vitest" | False for R1's backend — R1 ADR 001 deliberately runs Jest ^30 for NestJS. Vitest-everywhere stands on its own merits (D9). |
| MDRS-6 / MDRS-13 | boundary target named `boundaries` | R1's real, CI-proven name is `module-boundaries`; adopted (D5). |
| MDRS-10 | "apps keep bare names (tedrisat, tedris, …), matching the references" | Both reference repos scope their app packages. Apps scoped `@medaris/<component>` (D6). |
| MDRS-13 | `ui→shared` only; `web→ui,shared`; `shared→nothing` | Self-scopes added — forced by real edges (D5). |
| MDRS-13 | platform rules as positive lists | Inexpressible with untagged shared libs; `notDependOnLibsWithTags` + `allSourceTags` (D5). |
| MDRS-13 | maps libs `validation`, `errors`, `config` | Don't exist yet — reserved names for the post-merge `common` split (D1/D4). |
| MDRS-16 | deploy workflows have `paths:` filters to re-point | They don't — all 7 are release-tag / `workflow_dispatch` / `workflow_call` triggered with **no** `paths:` filters. MDRS-16's real work: Docker build contexts + `pnpm` install rewrite, `ci-dev.yaml` matrix, keycloak-theme Node 18→24. |
| MDRS-12 | "Delete madrasah-frontend/.prettierrc.json, .prettierignore" | Neither file exists — prettier runs via eslint plugins inside `shared/eslint-config` and dies with that package. |

## Related

- Epic: MDRS-6; implements from this ADR: MDRS-8 (catalog), MDRS-9 (history merge), MDRS-10 (pnpm+rename), MDRS-11 (Nx), MDRS-12 (Biome), MDRS-13 (boundaries), MDRS-14 (commit hygiene), MDRS-15 (CI), MDRS-16 (deploys), MDRS-17 (release-please), MDRS-18 (docs), MDRS-20 (Vitest), MDRS-21 (upgrades).
- Reference monorepos inspected 2026-07-21 (identities in MDRS-6): R1 — Nx 22.5.2, Biome 2.4.4, `module-boundaries` target, testing-stack ADR; R2 — Nx 23.0.0, Vitest 4.1.9 unit/integration split, pnpm supply-chain governance, ADR template. Plus the `madrasah-backend` and `madrasah-frontend` working trees.
- Product constraints: `docs/PRD.md` §8/§10 (modular monolith, service topology), `docs/ecosystem-boundaries.md` §4/§6 (no cross-project code imports).
- Upstream: nx.dev release policy · biomejs.dev changelog · TypeScript 7.0 announcement · nodejs.org release schedule · pnpm 11 release notes · Vitest 4.1 · NestJS 11 announcement.
