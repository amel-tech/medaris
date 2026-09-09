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

`apps/tedrisat/test/unit/flashcard/flashcard.service.spec.ts` — **17 tests**, ported from
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

## Review findings, and what was done about each

Three findings, all rated low, none blocking. Recorded here because two of them changed code
outside the removal itself.

**1. A docblock pointed at a file this PR deletes.**
`test/unit/flashcard/flashcard.repository.spec.ts` opened with "Unlike the example
repository specs next door, this mounts the REAL repository…". Those specs are gone, so the
contrast dangled. Reworded to state the property directly and note where the contrast went.
Fixed here rather than deferred: no other task owns that file.

**2. Schema/migration drift, already disclosed.** Left as follow-up #1 below, with the
reviewer's extra detail folded in: it is not only `0000_chunky_viper.sql` that still knows
about the table — every `meta/*_snapshot.json` through `0011` contains it too. The reviewer
asked for an explicit sign-off rather than a doc line, which is what follow-up #1 now spells
out.

**3. The new spec pinned an unsafe spread order.**
`FlashcardService.replaceManyProgress` built its rows as `{ userId, ...data }`, so a
`userId` arriving in the request body would have overridden the authenticated caller's. Not
reachable today — `CreateFlashcardProgressDto` declares no `userId` and
`MedarisValidationPipe` runs `forbidNonWhitelisted`, and `flashcard.controller.ts` is the
only caller — so this was not a live vulnerability. But the spec added by this PR asserted
that exact order, which would have encoded the weaker precedence as intended behaviour.

Rather than assert it, the order was flipped to `{ ...data, userId }` (one line in
`src/flashcard/flashcard.service.ts`, with a comment saying why) and a second test now
passes a spoofed `userId` and asserts the caller's wins. **This is hardening outside
MDRS-32's acceptance criteria**, taken because the alternative was to cement the weaker
order in a new test. It cannot change behaviour today, for the reasons above. Strip it if
the removal should stay strictly minimal.

A later AI re-review re-flagged `replaceManyProgress` as an advisory, noting the spread
order is now the *only* thing keeping a body-supplied `userId` out because the route binds
`ParseArrayPipe`, which does not inherit the global pipe's `whitelist` /
`forbidNonWhitelisted`. The order in the tree is already the safe one, so nothing more is
done here; making the guarantee structural — `ParseArrayPipe({ items:
CreateFlashcardProgressDto, whitelist: true, forbidNonWhitelisted: true })` in
`flashcard.controller.ts` — is left as a follow-up, out of scope for the example-module
removal.

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
| `pnpm nx run-many -t test --skip-nx-cache` | **207 tests / 14 suites**, green |
| `pnpm nx run-many -t build --skip-nx-cache` | 8 projects, green |
| `pnpm nx run-many -t lint --skip-nx-cache` | 16 projects, green |
| `pnpm nx run-many -t module-boundaries --skip-nx-cache` | 16 projects, green |
| `node tools/ci/biome-ratchet.mjs` | 537 files, 0 errors / 90 warnings / 27 infos (pre-merge snapshot; `c7ce652` re-based the ratchet at **89** after `main` merged — it now reads 550 files / 89 / 27) |
| `pnpm run depcheck` | 3 projects, no issue |
| `node tools/ci/assert-release-config.mjs` | 7 components, chain intact |

Test arithmetic, per `apps/*/coverage/junit.xml`:

| | before (`cb7e9636`) | after |
| -- | -- | -- |
| tedrisat | 224 tests / 15 suites | **205 / 12** |
| teskilat | 2 / 2 | 2 / 2 |
| **total** | **226 / 17** | **207 / 14** |
| of which tedrisat e2e | 6 suites | 5 suites |

`205 = 224 − 43 deleted + 17 (flashcard.service) + 6 (app e2e 404s) + 1 (getHealth)`.

Flashcard tests, for the issue's "≥6 in the flashcard module" criterion: **19 unit**
(`flashcard.service.spec.ts` 17, `flashcard.repository.spec.ts` 2) and 30 e2e
(`flashcard-bulk` 9, `flashcard-label` 21) — **49** in total, up from 32.

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

`tools/ci/biome-baseline.json` was lowered from 91 warnings to 90 on this branch, as its
own comment instructs, because the deleted files carried one warn-severity diagnostic —
then to **89** by `c7ce652` once `main` merged and the count was re-measured. Errors and
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

1. **The `examples` table is not dropped, and `example.schema.ts` therefore stays.** An
   earlier revision of this branch deleted the schema file too. That took `examples` out of
   the schema of record while `0000_chunky_viper.sql` still creates it and every
   `meta/*_snapshot.json` through `0011` still lists it, so the next
   `pnpm --filter @medaris/tedrisat db:generate` — run for an entirely unrelated change —
   would have folded `DROP TABLE "examples"` into that unrelated migration, where nobody is
   looking for it. Review caught it; the declaration was restored with a comment saying why.
   Nothing under `src/` imports it any more.

   Generating the drop migration inside this PR was measured and is **not** available:
   `drizzle-kit generate` stalls on an interactive rename prompt, because the schema and the
   migration history have already drifted on `main` in three further ways that predate this
   branch. Measured against `origin/main` and the local database:

   | table | in migrations | in `0011_snapshot.json` | in `src/database/schema` | in a migrated DB |
   | -- | -- | -- | -- | -- |
   | `examples` | created by `0000` | yes | yes (kept) | present |
   | `Flashcard_labeling` | created by `0007` | yes | **no** | present |
   | `deck_labels_decks` | created by `0007` | yes | **no** | present |
   | `flashcard_labelings` | **never created** | **no** | yes | **absent** |

   The generator sees one created table and three deleted ones and asks which is a rename of
   which — a question only someone who knows that history can answer, and the answer would
   land three unrelated tables in an MDRS-32 migration.

   The last row is a live bug, not just drift: `flashcard-label.reporsitory.ts:56` inserts
   into `flashcardLabelings`, and no migration ever creates that table, so
   `POST /flashcard-label/labeling` cannot succeed against a migrated database. The e2e suite
   does not catch it — `flashcard-label.e2e.spec.ts:38` asserts only the 401. This predates
   MDRS-32 and is reported separately.

   Whoever picks this up should resolve all four rows in one reviewed migration, with its
   snapshot and journal entry, and delete `example.schema.ts` in that same change.
2. **MDRS-44's unguarded-route count is now stale.**
   [`mdrs-40-pr-80-authz-assessment.md`](mdrs-40-pr-80-authz-assessment.md) records "17
   routes are currently unguarded — `app.controller.ts` (3 of 4), all 4 of
   `example.controller.ts`, all 5 of `flashcard-label.controller.ts`, all 5 of
   `flashcard-deck-label.controller.ts`". After this PR it is **2**, not 12:
   `app.controller.ts` has 2 routes (`/`, `/health`), both unguarded and both intentionally
   public, and the example controller is gone. The other 10 were already guarded on this
   branch's base, by MDRS-27 — `flashcard-label.controller.ts:53` and
   `flashcard-deck-label.controller.ts:33` each carry a class-level `@UseGuards(AuthGuard)`
   with no per-method override, and neither file is in this diff. The remaining gap in that
   area is ownership on the non-DELETE label routes (MDRS-26), which is a different property
   from being guarded and is not counted here. That assessment document is dated and was
   left as written.
3. **Two stale suite counts in vitest config comments — fixed in this PR.**
   `apps/tedrisat/vitest.config.ts` said "the four `test/e2e/*.e2e.spec.ts` suites" and
   `apps/tedrisat/vitest.integration.config.ts` said "There are six today"; after this
   branch merged `main` the real number is seven. The deferral reason is gone — MDRS-65's
   PR #49 (which also edited both files) landed on `main` and is now in this branch's
   history — so rather than substitute a number that will rot again, both comments drop the
   count and lean on the "the glob is deliberately not a fixed list" rationale already
   stated in each file.
4. **`docs/PRD.md:161` still reads "zero flashcard tests, no domain unit tests".** That was
   already inaccurate before this PR — `flashcard.repository.spec.ts` predates it — and is
   more so now with `flashcard.service.spec.ts` added. `docs/PRD.md` is on the never-modify
   list, so it is flagged here rather than edited.
