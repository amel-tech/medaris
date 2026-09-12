# MDRS-57 — one validator and one transformer for `tedrisat`

`apps/tedrisat` declared two validator packages (`@nestjs/class-validator@0.13.4`
and `class-validator@0.14.4`) and two transformer packages
(`@nestjs/class-transformer@0.4.0` and `class-transformer@0.5.1`). Two DTOs
imported decorators from **both** validators inside a single class, and in
`CreateFlashcardDeckLabelingDto` a single field carried `@IsUUID()` from one and
`@IsString()` from the other.

The forks are gone. Everything now imports `class-validator` and
`class-transformer`.

---

## Step A — the measurement

The issue predicted that one half of the decorators was **inert**: each package
was said to own a private metadata storage singleton, so `validate()` would read
only its own package's decorators and silently ignore the rest. The first task
was to determine which half.

**That prediction is wrong, and the tree is not broken in the way it describes.**
Both halves were live. What follows is what was actually run.

### A1 — through the real pipe

A throwaway spec drove `MedarisValidationPipe` (the real one, from
`@medaris/common`) against a class carrying `@MinLength(5)` from each package:

```
$ npx vitest run test/unit/validator-storage-probe.spec.ts   # in apps/tedrisat

A1 nest-fork-violated -> ["fromNestFork must be longer than or equal to 5 characters"]
A2 plain-violated     -> ["fromPlain must be longer than or equal to 5 characters"]
A3 both-violated      -> ["fromNestFork must be longer than or equal to 5 characters",
                          "fromPlain must be longer than or equal to 5 characters"]
A4 nest-fork storage holds -> ["fromNestFork","fromPlain"]
A4 plain storage holds     -> ["fromNestFork","fromPlain"]
A5 @nestjs/common resolves class-validator to ->
     node_modules/.pnpm/class-validator@0.14.4/node_modules/class-validator/cjs/index.js
```

Both constraints fire. Both `getMetadataStorage()` calls return a storage
holding **both** properties.

The pipe was constructed with `whitelist: false, forbidNonWhitelisted: false`
for A1–A3 on purpose. With the app's real settings (`whitelist: true`) a throw
proves nothing: a property with no registered metadata is stripped and
`forbidNonWhitelisted` rejects the request, so an inert decorator and a working
one both produce a 400. Turning the whitelist off is what makes a throw mean
"the constraint ran".

### A2 — why they share

Both packages key the storage on the same **global** property:

```js
// class-validator@0.14.4 .../metadata/MetadataStorage.js
// @nestjs/class-validator@0.13.4 .../metadata/MetadataStorage.js  — identical
function getMetadataStorage() {
    const global = getGlobal();
    if (!global.classValidatorMetadataStorage) {
        global.classValidatorMetadataStorage = new MetadataStorage();
    }
    return global.classValidatorMetadataStorage;
}
```

`classValidatorMetadataStorage` is not namespaced per package. Whichever package
runs a decorator first constructs the instance; the other reuses it. So
decorators from both register into one storage, and `validate()` from either
reads all of them. The fork is a fork of the code, not of the storage key.

### A3 — load order does not change it

The two `MetadataStorage` classes are **not** the same implementation —
`validationMetadatas` and `constraintMetadatas` are a `Map` in 0.14.4 and an
`Array` in 0.13.4 — so which package wins the race decides which implementation
is installed globally. Both outcomes were forced and measured:

```
$ node order-probe.cjs / decorator-order-probe.cjs

firstDecoratorApplied: "nest"
  storageOwner: @nestjs/class-validator@0.13.4 (Array-shaped)
  errorsSeenBy_plain_validate:    ["fromNestFork","fromPlain"]
  errorsSeenBy_nestFork_validate: ["fromNestFork","fromPlain"]

firstDecoratorApplied: "plain"
  storageOwner: class-validator@0.14.4 (Map-shaped)
  errorsSeenBy_plain_validate:    ["fromNestFork","fromPlain"]
  errorsSeenBy_nestFork_validate: ["fromNestFork","fromPlain"]
```

Both constraints are enforced under either owner, and neither `validate()`
crashes on the other's storage shape. The `require` order turned out not to be
the lever at all — the storage is constructed lazily, so the **first decorator
applied** decides.

### A4 — end to end, before and after

The decisive check is `apps/tedrisat/test/e2e/dto-validation.e2e.spec.ts`, added
by this task, which covers the constraints on both mixed DTOs (36 cases). The
final version of the spec was run against a real Postgres container on both
trees:

| tree | result |
|---|---|
| **before** consolidation (mixed imports, both packages installed) | 36 passed |
| **after** consolidation (`class-validator` only) | 36 passed |

The "before" run was produced by reverting the source, `package.json`,
`pnpm-workspace.yaml` and `pnpm-lock.yaml` changes with `git checkout --`,
reinstalling, running the suite, and reapplying the change as a patch. That
identical result is the evidence that **no constraint was inert and the
consolidation changed no behaviour.** Without it, a suite written after the
change only proves the new code agrees with itself.

### A5 — where a real split storage does exist

`class-transformer` is a different story. Its storage is **module-level**, not
global:

```js
// both class-transformer@0.5.1 and @nestjs/class-transformer@0.4.0 — storage.js
exports.defaultMetadataStorage = new MetadataStorage();
```

Two packages, two genuinely separate storages, and `@Type()` registered in one
is invisible to `plainToInstance()` from the other. In this tree it caused no
live defect, and that is luck rather than design:

- `flashcard-response.dto.ts` carried `@Type()` from the fork, but nothing ever
  transforms `FlashcardResponse` — no `ClassSerializerInterceptor` is mounted
  and no `plainToInstance` call targets it. The decorator was dead weight.
- The one real call, `plainToClass(CreateFlashcardDto, cards)` in
  `flashcard-bulk.service.ts`, targets a DTO with no `@Type()` at all.

Removing only the validator fork would have made this worse, not better: that
service would then have paired `plainToClass` from the fork with `validate` from
upstream. Both pairs were consolidated for that reason.

---

## What changed

- Eight source files now import `class-validator` / `class-transformer`:
  `create-flashcard.dto.ts`, `create-flashcard-deck.dto.ts`,
  `create-flashcard-label.dto.ts`, `create-flashcard-deck-label.dto.ts`,
  `create-flashcard-progress.dto.ts`, `flashcard-deck-label-response.dto.ts`,
  `flashcard-response.dto.ts`, `flashcard-bulk.service.ts`. The two mixed DTOs
  went from two import statements to one. Only module specifiers and import
  order changed — no decorator was added, removed or reordered.
- `@nestjs/class-validator` and `@nestjs/class-transformer` removed from
  `apps/tedrisat/package.json` **and** from the `catalog:` in
  `pnpm-workspace.yaml`, so the import path cannot come back by accident. This
  is what the issue asked for over a lint rule, and it is why `pnpm-lock.yaml`
  is in the diff.
- `apps/tedrisat/test/e2e/dto-validation.e2e.spec.ts` — new spec covering both
  mixed DTOs.
- `tools/ai-review/lenses.yaml` — the `correctness` lens carried a whole section
  and two `known_false_positives` entries instructing reviewers that the fork
  imports were "intentional and catalogued", with line references into the
  catalog entries this task deletes. That file is loaded as
  `AI_REVIEW_LENSES_FILE` by `.github/workflows/ai-review.yml` on every PR, so
  leaving it would have left a live gate telling reviewers to wave through
  exactly the regression this task removes. The rule is now inverted: an import
  of either fork is a finding.

## What was verified

Full gate, `--skip-nx-cache`, on this branch:

| target | result |
|---|---|
| `typecheck` | 16 projects |
| `test` | 262 tests / 18 files (`tedrisat` 260/16, `teskilat` 2/2) |
| `build` | 8 projects |
| `lint` | 16 projects |
| `module-boundaries` | 16 projects |

The 226-test / 17-file baseline at `cb7e9636` plus this task's 36 cases in one
new file accounts for the totals exactly.

Also verified: `pnpm-lock.yaml` contains no reference to either fork after
`pnpm install`, and neither is linked into `apps/tedrisat/node_modules/@nestjs/`.
(Orphaned directories may linger under the local `node_modules/.pnpm` store;
nothing resolves to them.)

## What was NOT verified

- **No running app was exercised.** Everything above is the test container and
  standalone Node probes. Behaviour against a live Keycloak-fronted deployment
  was not observed.
- **The OpenAPI spec was not regenerated.** `apps/tedrisat/nest-cli.json`
  declares no `plugins`, so the `@nestjs/swagger` CLI plugin — the thing that
  would read validator metadata into the schema — is not enabled, and the spec
  comes purely from explicit `@ApiProperty()` decorators, none of which changed.
  On that reasoning `libs/services/swagger-docs/tedrisat.json` should be
  unaffected and it was deliberately not hand-edited. This was reasoned from the
  config, **not** measured by diffing a regenerated spec.
- **Only `tedrisat` was in scope.** `apps/teskilat` and `libs/common` already
  used the upstream packages and were not touched.

## Follow-ups

1. **`@IsUUID()` and `ParseUUIDPipe` disagree.** `@IsUUID()` in class-validator
   0.14 validates the version and variant nibbles, so an id like
   `22222222-2222-2222-2222-222222222222` is rejected in a request **body** while
   `ParseUUIDPipe` still accepts the same string in a **path**. Several existing
   suites use such ids for path params. Pre-existing, unrelated to the fork, and
   left alone here; the new spec uses real v4 values so its cases stay about the
   constraint under test. Worth settling deliberately — either pin a version on
   `ParseUUIDPipe` or relax `@IsUUID()`.
2. **Nothing prevents the fork from being reinstalled.** Removing it from the
   catalog makes `catalog:` fail, but a bare version string in a package.json
   would still resolve. A `depConstraints` or `no-restricted-imports` rule would
   close that, and belongs with the boundaries work (MDRS-13) rather than here.
3. **`@Type()` on `FlashcardResponse` is still dead.** It now points at the right
   package, but no transform reads it. Either mount serialization or drop the
   decorator — a decision about response shaping, not about validators.
4. **`CLAUDE.md:22` and `README.md:71` still say "91 tests / 10 suites".** That
   was already wrong before this task (226/17 at `cb7e9636`) and is 256/18 after
   it. Left alone here because both are governance documents outside this task's
   scope, but the number is now recorded correctly above and the correction is
   cheap for whoever next touches them.
5. **A `null` element inside a bulk batch throws.** `validate()` in
   `flashcard-bulk.service.ts` raises a `TypeError` on a null row, so the request
   is a 500 rather than a row-level error. Pre-existing, identical under both
   packages, and an error-handling matter rather than a validator one.
