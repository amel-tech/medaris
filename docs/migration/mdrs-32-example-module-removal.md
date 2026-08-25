# MDRS-32 — removing the example module and the debug endpoints

Record for [MDRS-32](https://linear.app/amel-tech/issue/MDRS-32). Branched from
`origin/main` at **`cb7e9636`**. The envelope decision this work needed is
[ADR-002](../adr/002-api-response-shape.md).

## What was removed

**The example CRUD surface.** `apps/tedrisat/src/example/**` (8 files: controller, service,
repository, module, interface, two DTOs, one error) and its Drizzle table definition
`apps/tedrisat/src/database/schema/example.schema.ts`, plus the `export * from
"./example.schema"` line in that directory's `index.ts`. `ExampleModule` is gone from
`apps/tedrisat/src/app.module.ts` — it was registered unconditionally, and the controller
carried no `@UseGuards`, so `GET/POST /examples` and `GET/DELETE /examples/:id` were
unauthenticated CRUD against a real table in every environment the app was deployed to.

**Two debug routes on `AppController`.** `GET /throw-error`, whose whole body was
`throw new ValidationError(...)`, and `GET /secure`, a guarded no-op returning a string
literal. `apps/tedrisat/src/app.controller.ts` now declares two routes, `/` and `/health`,
and no longer imports `AuthGuard`, `UseGuards` or `ValidationError`.

**The response envelope.** `libs/common/src/response/` in full — `MedarisResponse`,
`MedarisMetaResponse`, `MedarisMetaPaginationResponse` — and the
`export * from "./response"` line in `libs/common/src/index.ts`. The rationale, the
alternatives, and the pagination question are in ADR-002; the short version is that the
example controller was the only caller in the tree, on all four of its routes, and the one
endpoint that genuinely paginates (`PaginatedKoskResponse`) already carries its own typed
fields.

**Four specs.** `test/e2e/example.e2e.spec.ts` (13 tests) and the three
`test/unit/example/*.spec.ts` files (8 + 11 + 11 = 30 tests). Deleting the e2e spec was a
judgement call recorded here rather than left implicit: it exercises routes that no longer
exist, so keeping it would mean keeping the module it tests.

## What was added

`apps/tedrisat/test/unit/flashcard/flashcard.service.spec.ts` — **16 tests**, ported from
the deleted `example.service.spec.ts`: real service, mocked repository, one assertion group
per method covering the arguments handed down and the repository rejection path. It also
covers what the example spec had nothing to test — the `include` allow-list in
`toIncludeSet` (an unrecognised value is dropped, an omitted list becomes an empty set) and
the `deckId` / `authorId` / `userId` fields `FlashcardService` stitches onto its DTOs before
they reach the repository.

Six assertions in `test/e2e/app.e2e.spec.ts` asserting **404** on `/examples`,
`/examples/1`, `/throw-error`, `/secure`, `POST /examples` and `DELETE /examples/1`. This is
the regression guard for the issue's first acceptance criterion: without it, a
re-registered `ExampleModule` would be invisible to the suite.

One assertion in `test/unit/app.controller.spec.ts` for `getHealth`. That spec also lost its
`AuthGuardModule` import and its stub keycloak config, which existed only for `GET /secure`.

`test/e2e/app.e2e.spec.ts` also moved from `beforeEach` to `beforeAll`. It only ever closed
the app in `afterAll`, so every test but the last left an unclosed Nest instance and its pg
pool behind. That was latent at 2 tests; the six 404 assertions would have made it
eight-fold. None of the tests in the suite mutate state, so one instance is enough. Caught
in review, not by a red gate — the suite was green both ways.

## The generated client

`libs/services/swagger-docs/tedrisat.json` was edited by hand — the four paths (`/examples`,
`/examples/{id}`, `/throw-error`, `/secure`) and the four now-unreferenced component schemas
(`CreateExampleDto`, `MedarisResponse`, `MedarisMetaResponse`,
`MedarisMetaPaginationResponse`) were deleted. Before editing, a JSON round-trip through
`json.dumps(indent=2, ensure_ascii=False)` was verified byte-identical to the committed
file, so the diff contains only the deletions and no reformatting. Reference counting was
done over the whole document first: those four schemas were reachable *only* from the
`/examples` paths and from each other. `wc -l` went 3517 → 3269; `wc -c` 84815 → 78085.

`pnpm --filter @medaris/services generate:tedrisat` was then re-run (openapi-generator-cli
7.14.0, the version pinned in the root `openapitools.json`, on OpenJDK 21.0.11). The
generator does not delete files it no longer emits, so the five orphans were removed by
hand: `src/apis/ExamplesApi.ts`, `src/models/CreateExampleDto.ts`,
`src/models/MedarisResponse.ts`, `src/models/MedarisMetaResponse.ts`,
`src/models/MedarisMetaPaginationResponse.ts`.

One generator artefact was reverted deliberately: the regenerated
`generated/package.json` dropped a hand-added `"private": true`. That line is not generator
output, so it was restored to keep this diff scoped. It is not load-bearing for pnpm —
`pnpm-workspace.yaml` enumerates its 16 packages explicitly with no globs (ADR-001 §D11) —
but removing it is not this task's decision to make.

`TedrisatServiceApi.ts` lost `getSecureHelloRaw` / `getSecureHello` and
`throwTestErrorRaw` / `throwTestError`; `apis/index.ts` and `models/index.ts` lost the
matching re-exports; `.openapi-generator/FILES` lost five rows. Nothing else in the
generated tree changed, which is the evidence that the hand-edit to the spec was
well-formed.

No app or library outside the generated tree imported `ExamplesApi`, `CreateExampleDto`,
`ExampleResponseDto`, `getSecureHello` or `throwTestError`. Verified by grep over
`apps/` and `libs/`.

## Verified

Every number below is from command output on this branch, not an estimate.

| Gate | Result |
| -- | -- |
| `pnpm nx run-many -t typecheck --skip-nx-cache` | 16 projects, green |
| `pnpm nx run-many -t test --skip-nx-cache` | **206 tests / 14 suites**, green |
| `pnpm nx run-many -t build --skip-nx-cache` | 8 projects, green |
| `pnpm nx run-many -t lint --skip-nx-cache` | 16 projects, green |
| `pnpm nx run-many -t module-boundaries --skip-nx-cache` | 16 projects, green |
| `node tools/ci/biome-ratchet.mjs` | 537 files, 0 errors / 90 warnings / 27 infos |
| `pnpm run depcheck` | 3 projects, no issue |
| `node tools/ci/assert-release-config.mjs` | 7 components, chain intact |

Test arithmetic, per `apps/*/coverage/junit.xml`:

| | before (`cb7e9636`) | after |
| -- | -- | -- |
| tedrisat | 224 tests / 15 suites | **204 / 12** |
| teskilat | 2 / 2 | 2 / 2 |
| **total** | **226 / 17** | **206 / 14** |
| of which tedrisat e2e | 6 suites | 5 suites |

`204 = 224 − 43 deleted + 16 (flashcard.service) + 6 (app e2e 404s) + 1 (getHealth)`.

Flashcard tests, for the issue's "≥6 in the flashcard module" criterion: **18 unit**
(`flashcard.service.spec.ts` 16, `flashcard.repository.spec.ts` 2) and 30 e2e
(`flashcard-bulk` 9, `flashcard-label` 21) — **48** in total, up from 32.

tedrisat coverage moved as follows (v8 provider, Node 22.20.0; the thresholds in
`apps/tedrisat/vitest.config.ts` are 60 / 50 / 58 / 60 and were never at risk):

| | before | after |
| -- | -- | -- |
| statements | 77.24 % (577/747) | 77.65 % (556/716) |
| branches | 69.44 % (200/288) | 69.36 % (197/284) |
| functions | 75.29 % (253/336) | 76.34 % (242/317) |
| lines | 76.96 % (548/712) | 77.23 % (526/681) |

`src/flashcard` specifically went 45.52 % → 48.63 % statements, which is the added spec.

Acceptance-criteria greps, run on this branch:

- `grep -rn 'MedarisResponse' apps/*/src libs/*/src` → no matches (exit 1).
- `grep -rn 'getSecureHello\|throw-error' libs/services/src` → no matches (exit 1).

`tools/ci/biome-baseline.json` was lowered from 91 warnings to 90, as its own comment
instructs, because the deleted files carried one warn-severity diagnostic. Errors and
infos are unchanged.

## Not verified

- **No booted app was queried.** The 404s for `/examples`, `/throw-error` and `/secure` are
  asserted by `test/e2e/app.e2e.spec.ts` against a Testcontainers-backed Nest instance,
  which is the strongest evidence available here, but nobody curled a deployed
  environment. The claim is about this tree, not about production.
- **The `examples` table is still created.** See the follow-up below; nothing in this branch
  drops it, and no live database was inspected.
- **`pnpm --filter @medaris/services generate` was not run in full** — only
  `generate:tedrisat`. The full script chains a `lint:fix` npm script that does not exist in
  `libs/services/package.json`; formatting was applied with `biome check --write` instead,
  and `-t lint` is green.
- **Node 24.** CI runs the Node version in `.nvmrc`; every number above was measured on
  Node 22.20.0 locally. v8 coverage percentages can move a little across Node majors.

## Follow-ups (no Linear issues opened)

1. **The `examples` table is not dropped.** `example.schema.ts` is gone, but migration
   `0000_chunky_viper.sql` still creates `examples` and no migration drops it, so the
   Drizzle schema and the migration history have drifted by one table. The consequence is
   concrete: the next `pnpm --filter @medaris/tedrisat db:generate` will emit
   `DROP TABLE "examples"` as part of whatever unrelated change triggered it, and
   `drizzle-kit generate` asks interactively whether the table was deleted or renamed, so
   that prompt has to be answered by a human. Dropping a table was left out of this PR
   deliberately: it is destructive, it is not in MDRS-32's acceptance criteria, and it wants
   its own reviewed migration. Whoever picks it up should land a standalone
   `DROP TABLE IF EXISTS "examples";` migration before touching the schema for anything
   else.
2. **MDRS-44's unguarded-route count is now stale.**
   [`mdrs-40-pr-80-authz-assessment.md`](mdrs-40-pr-80-authz-assessment.md) records "17
   routes are currently unguarded — `app.controller.ts` (3 of 4), all 4 of
   `example.controller.ts`, all 5 of `flashcard-label.controller.ts`, all 5 of
   `flashcard-deck-label.controller.ts`". After this PR it is **12**: `app.controller.ts`
   has 2 routes (`/`, `/health`), both unguarded, and the example controller is gone. That
   document is a dated assessment and was left as written.
3. **Two stale suite counts in vitest config comments.**
   `apps/tedrisat/vitest.config.ts` says "the four `test/e2e/*.e2e.spec.ts` suites" and
   `apps/tedrisat/vitest.integration.config.ts` says "There are six today"; the real number
   is five. Both were already wrong before this PR (the first said four when there were
   six). They were left untouched on purpose — MDRS-65's open PR #49 edits both files, and a
   comment-only change here would conflict with it for no benefit. Fix them in whichever of
   the two lands second.
4. **`docs/PRD.md:161` still reads "zero flashcard tests, no domain unit tests".** That was
   already inaccurate before this PR — `flashcard.repository.spec.ts` predates it — and is
   more so now with `flashcard.service.spec.ts` added. `docs/PRD.md` is on the never-modify
   list, so it is flagged here rather than edited.
