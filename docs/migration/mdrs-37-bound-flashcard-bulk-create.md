# MDRS-37 — validate and bound the flashcard bulk-create body

Base: `origin/main` `22a4c6f`.

## What was wrong

`POST /flashcard/decks/:deckId/cards/bulk` bound its body as a bare
`@Body() cardsDto: CreateFlashcardDto[]`. Nest's `ValidationPipe` skips array
metatypes, so the global `MedarisValidationPipe` checked nothing at all — not
even that the body was an array. The chain that followed:

1. `FlashcardBulkService.validateCards` runs `plainToClass(CreateFlashcardDto, cards)`.
   For a non-array body that yields a single object, whose `.length` is
   `undefined`, so `for (let i = 0; i < items.length; i++)` never iterates and
   `isError` stays `false`.
2. Control reaches `FlashcardService.createMany`, whose `cards.map(...)` throws
   `TypeError: cards.map is not a function`.
3. `GlobalExceptionFilter` has no branch for a plain `TypeError`, so the caller
   got a raw 500 carrying the internal message.

An empty array passed the same validation and reached
`FlashcardRepository.createMany`, where `db.insert(...).values([])` produces
invalid SQL.

Neither path had an upper bound. `addFlashcards` and the CSV/XLSX import both
end in one `INSERT ... VALUES`, sized by whatever the client sends; the import
path's only limit was a 5 MB `MaxFileSizeValidator`, which a 1000-row CSV is
nowhere near.

## What changed

- `apps/tedrisat/src/flashcard/flashcard.controller.ts` — the bulk handler now
  binds `@Body(new ParseArrayPipe())` and declares
  `@ApiUnprocessableEntityResponse({ type: BulkFlashcardErrorResponse })` (it
  could already return 422 via `BulkValidationError`, undocumented).
- `apps/tedrisat/src/flashcard/flashcard-bulk.service.ts` — exports
  `MAX_BULK_ROWS = 1000` and guards `addFlashcards`: a non-array or empty input
  throws `BulkPayloadError` (400), more than the cap throws
  `BulkRowLimitExceededError` (422).
- `apps/tedrisat/src/flashcard/errors/bulk-payload.error.ts` (new) — code
  `BULK_PAYLOAD_INVALID`, extends the shared `BadRequestError`.
- `apps/tedrisat/src/flashcard/errors/bulk-row-limit.error.ts` (new) — code
  `BULK_ROW_LIMIT_EXCEEDED`, 422, context `{ errors: RowError[] }`. Same shape
  `BulkValidationError` already returns, so nizam's `ImportErrorsDialog` renders
  it without a second client code path. The row reported is `MAX_BULK_ROWS + 2`
  — the first rejected row in the file's own numbering (1-based + header).
- `apps/tedrisat/src/flashcard/flashcard.repository.ts` — `createMany` returns
  `[]` for an empty batch instead of emitting `values([])`.

Both entry points — the JSON body and the file import — pass through
`addFlashcards`, so the cap is enforced once at that choke point rather than
duplicated in the controller as the issue proposed. The import path's existing
zero-row check at `flashcard.controller.ts` still fires first and keeps its more
specific "the uploaded file contains no data rows" message.

### Why the pipe takes no `items:`

The sibling `POST decks/:deckId/cards` uses
`new ParseArrayPipe({ items: CreateFlashcardDto })`, and the obvious move was
to copy it. That would have been a regression here, and the first draft of this
change made it before review caught it.

`ParseArrayPipe`'s array check is unconditional; `items` only adds per-element
DTO validation on top. This endpoint already validates elements, and better:
`FlashcardBulkService.validateCards` runs with `whitelist` /
`forbidNonWhitelisted` and aggregates **every** bad row into the 422
`RowError[]` body. The pipe would have pre-empted that with a 400 carrying only
the first bad row, because its default path is `Promise.all` rather than its
aggregating branch. The sibling endpoint needs `items` precisely because it has
no `validateCards` behind it.

So the bulk endpoint's error contract is unchanged by this PR — every kind of
row error still produces the same 422 it did on main. `flashcard-bulk.e2e.spec.ts`
pins this with a batch whose rows 1 and 3 are both invalid, asserting both are
reported (`rows: [2, 4]`).

## Verified

Full gate on this branch, `--skip-nx-cache` throughout, Docker 29.3.1 running:

| gate | result |
| --- | --- |
| `typecheck` | 16 projects pass |
| `test` | **138 tests / 14 suites pass** (was 127 / 12) |
| `build` | 8 projects pass |
| `lint` | 16 projects pass |
| `module-boundaries` | 16 projects pass |
| `node tools/ci/biome-ratchet.mjs` | 0 errors / 94 warnings / 27 infos, all at baseline |

`CLAUDE.md`'s expected counts were updated from 127 / 12 to 138 / 14, and its
"of tedrisat's 10 suites, 5 are e2e" line to 12 / 6.

New coverage:

- `apps/tedrisat/test/e2e/flashcard-bulk.e2e.spec.ts` — 9 cases against a real
  Testcontainers postgres: `{}` → 400; `{ cards: [...] }` → 400; `[]` → 400
  with code `BULK_PAYLOAD_INVALID` and zero rows written; two invalid rows in
  one batch → a single 422 reporting both (`rows: [2, 4]`); an unknown property
  → 422 `BULK_VALIDATION_ERROR` at row 2; exactly 1000 cards → 201 with
  `count: 1000`; 1001 → 422 with code `BULK_ROW_LIMIT_EXCEEDED`, the cap named
  in the message, and zero rows written; a 1001-row CSV import → 422 with the
  same code; and the error body's `RowError` shape pinned.
- `apps/tedrisat/test/unit/flashcard/flashcard.repository.spec.ts` — the real
  repository with a mocked `DatabaseService`: `createMany([])` resolves to `[]`
  with `insert` never called, and a non-empty batch still reaches
  `insert().values().returning()`.

### The defect, measured on main

The three source files were reverted to `origin/main` `22a4c6f` in this
worktree and the same four requests replayed, to confirm the tests reproduce
the defect rather than merely passing:

| request | on main | on this branch |
| --- | --- | --- |
| body `{}` | **500** `cards.map is not a function` | 400 |
| body `[]` | **500** `values() must be called with at least one value` | 400 |
| 1001 cards | **201** `{"count":1001}` | 422 |
| CSV, 1001 data rows (29,848 bytes) | **201** | 422 |

The CSV figure is the measured file size — 0.6% of the 5 MB
`MaxFileSizeValidator` that was the import path's only bound.

## Not verified

- **The cap value itself.** 1000 is the number the issue proposed; no
  measurement of what a single `INSERT` of that size costs against production
  hardware was made. If it proves wrong it is one constant,
  `MAX_BULK_ROWS` in `flashcard-bulk.service.ts`.
- **The generated client.** `libs/services/src/tedrisat/generated/` is checked
  in and was not regenerated, so the new `@ApiUnprocessableEntityResponse` on
  the bulk endpoint is not yet reflected in `FlashcardCardsApi.ts`. No existing
  generated type changes shape — `BulkFlashcardErrorResponse` is already
  generated — so nothing breaks; the endpoint's 422 is simply still undeclared
  client-side.
- **Behaviour against a live Keycloak.** The e2e suites stub `AuthGuard`, as
  every other e2e file in this repo does.
- **XLSX import.** The new import test uses CSV. The cap sits in
  `addFlashcards`, downstream of `excelService.parseFile`, so it is
  format-independent by construction — but only the CSV branch was exercised.

## Follow-ups

- **File-level conflict with the `@Authz` work.** MDRS-43 ("Apply @Authz to the
  flashcard, deck, köşk and course endpoints") also edits
  `flashcard.controller.ts`, touching the same handlers from the authorization
  side. The two changes are orthogonal — DTO validation here, authorization
  there — but they will need sequencing.
- **The other unbounded bulk endpoint.** `PUT /flashcard/cards/progress`
  (`replaceManyProgress`) takes a `ParseArrayPipe`-validated array with no cap
  and ends in a single `INSERT ... ON CONFLICT`. Out of scope for MDRS-37's
  acceptance criteria; not filed.
