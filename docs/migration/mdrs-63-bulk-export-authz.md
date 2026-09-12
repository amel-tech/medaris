# MDRS-63 — deck ownership on the bulk write and export paths

Base: `cb7e9636` (`origin/main` at the time of writing).
Branch: `argedikas/mdrs-63-bulk-export-authz`.

## The defect

`@UseGuards(AuthGuard)` on `FlashcardController` proved that the caller held a valid realm
token and nothing else. The four deck-scoped handlers then called the bare
`FlashcardDeckService.findById`, which reaches `FlashcardDeckRepository.findById` →
`eq(decks.id, id)` — `decks.id` only, no `authorId` predicate. Any authenticated user who knew
or guessed a deck UUID could:

- write up to `MAX_BULK_ROWS` cards into somebody else's private deck through
  `POST decks/:deckId/cards/bulk`,
- do the same through `POST decks/:deckId/cards/bulk/import` with a file,
- do the same one array at a time through `POST decks/:deckId/cards`,
- and read every card out of it through `GET decks/:deckId/cards/bulk/export`.

The `userId` argument `FlashcardBulkService.exportFlashcards` passes down looks like a scoping
argument and is not one. It reaches `FlashcardRepository.findByDeckId`, which passes it to
`buildWith` — and `exportFlashcards` supplies no `include`, so `buildWith` returns `{}` and the
id is never read at all. Even with an `include` it would scope only the progress relation; the
rows come back filtered on `deckId` alone either way. It was never an access decision.

This is not a regression. MDRS-37 hardened the *payload* of the bulk handler and left the
*access decision* open; `docs/migration/mdrs-40-pr-80-authz-assessment.md` records the gap as
held under this epic.

## What was done

**`apps/tedrisat/src/flashcard/errors/deck-forbidden.error.ts`** (new) — `DeckForbiddenError`,
code `DECK_FORBIDDEN`, extending `ForbiddenError` from `@medaris/common`. A copy of
`KoskForbiddenError` down to the shape of the default message.

**`apps/tedrisat/src/flashcard/flashcard-deck.service.ts`** — `assertOwner(deckId, userId)`.
Reads the deck's `authorId` through the new one-column `findAuthorId` repository method
(`select({ authorId }) … limit(1)`, the sibling of `KoskRepository.findOwnerId`), throws
`DeckNotFoundError` when there is no row and `DeckForbiddenError` when `authorId !== userId`,
and returns `void` like `KoskService.assertOwner`. **`findOwned(deckId, userId)`** makes the
same decision on the full row and returns the deck; `exportCards` uses it because it needs
`deck.title` for the filename, so it still pays one round trip, not two.

The first version of this branch made `assertOwner` load the whole row through `findById` and
return it, to avoid a new repository member. Review pointed out the cost: `findById` selects
every column of `decks` — `description` is unbounded `text` — with no `LIMIT 1`, and three of
the four callers threw all of it away to compare one column. The narrow projection is the
repository's own established shape for this question, so it was adopted.

**`apps/tedrisat/src/flashcard/flashcard.controller.ts`** — `assertOwner` called in
`createMany`, `bulk`, `exportCards` and `importCards`, replacing the bare `findById` + null
check where one existed (`bulk`, `exportCards`, `importCards`) and adding the missing check
outright in `createMany`, which had none. `DeckNotFoundError` is no longer imported here — the
service throws it now. `@ApiForbiddenResponse` and, where missing, `@ApiNotFoundResponse` were
added to the four routes.

The four checks sit in the **controller**, which is the first controller-level `assertOwner` in
the app — `KoskService`, `CourseService` and both label services call it from the service
method, so the guard travels with the operation. That divergence is deliberate: this is the
stopgap MDRS-43 strips back out of exactly these four handlers when `@Authz` lands on them (see
follow-up 5), and keeping it at the HTTP edge makes that a clean removal. The cost is real and
worth naming — `FlashcardService.createMany`, `FlashcardBulkService.addFlashcards` and
`exportFlashcards` stay callable without an ownership check from any other caller — so do
**not** copy this placement into a module MDRS-43 will not revisit; put the assertion in the
service there.

In `importCards` the assertion runs before `excelService.parseFile`, so a foreign deck id costs
an attacker the 403 and no spreadsheet parsing. It does **not** run before the upload is
received: Nest resolves `@UploadedFile` — `FileInterceptor` plus `ParseFilePipe` — before the
handler body, so the file is already buffered and size/type-checked at that point.

**`apps/tedrisat/test/e2e/flashcard-bulk.e2e.spec.ts`** — a second `describe` block with seven
cases, following the two-app pattern `flashcard-label.e2e.spec.ts` established for MDRS-27:
`createTestApp({ authUserId })` stubs the guard to impersonate one user, so the deck is created
as `TEST_USER_ID` through the API and a second app authenticated as `OTHER_USER_ID` attacks it.

## The rule this encodes, and what it deliberately excludes

**Only the deck's author may bulk-write into it or export it.** `authorId` decides; nothing
else does.

`isPublic` is visibility, not shared ownership. A public deck stays readable and collectable by
anyone — `findAllVisibleToUser`, `GET decks/:id` and the collection routes are untouched — but
only its author may write cards into it or export it. There is no role model in this repository
(no `@Roles`, no `RolesGuard`, nothing in the JWT), so there is no administrator who may act on
another user's deck either.

**Public/shared-deck write access is explicitly out of scope and left to MDRS-45.** If
collaborative decks arrive, `FlashcardDeckService.assertOwner` is the single method that learns
about them.

The **404/403 split is kept**, matching `KoskService.assertOwner`, `FlashcardLabelService` and
the DELETE routes since MDRS-27: an id that is not there is a 404, an id that is there but
belongs to somebody else is a 403. That does tell a caller which deck UUIDs exist. It is
defended rather than denied: deck ids are v4 UUIDs and are not enumerable in practice, and a
blanket 404 would make a genuine permission problem indistinguishable from a mistyped id. A
test pins it so a later change has to argue with it.

## What was verified

All five gates run locally on this branch with `--skip-nx-cache`, all green:

| Gate | Result |
| --- | --- |
| `typecheck` | 16 projects ✅ |
| `test` | **233 tests / 17 files** ✅ (2 in `common`, 231 in `tedrisat`) |
| `build` | 8 projects ✅ |
| `lint` | 16 projects ✅ |
| `module-boundaries` | 16 projects ✅ |

The base `cb7e9636` measured **226 tests / 17 files**; this branch adds seven e2e cases and no
new test file, which accounts for the difference exactly.

The seven new e2e cases, all against a real Postgres via Testcontainers:

- bulk create into another user's deck → **403 `DECK_FORBIDDEN`**, and `countCards() === 0`
  read back **through the owner's app**, not the attacker's.
- file import into another user's deck → 403, `countCards() === 0`.
- non-bulk `POST decks/:deckId/cards` into another user's deck → 403, `countCards() === 0`.
- export of another user's deck, with two cards seeded by the owner first → 403, the response
  body contains none of the card content, and the owner's two rows survive.
- the owner can still bulk-create into and export their own deck (201 / 200) — the guard is not
  simply refusing everyone.
- bulk create into another user's **public** deck → 403, and the deck still holds zero cards.
  `isPublic` is visibility, not shared ownership; pinned the way
  `flashcard-label.e2e.spec.ts` pins the same rule for PUBLIC labels.
- a deck id that does not exist → **404 `DECK_NOT_FOUND`**, not 403.

A `/code-review` pass confirmed all six of the pre-existing cases would have failed on
`cb7e9636`: `bulk`, `exportCards` and `importCards` had a bare existence check and `createMany`
had no check at all, and each new case asserts `body.code === "DECK_FORBIDDEN"` so an unrelated
403 cannot satisfy it. The owner happy-path and the 404 case pass on base by design — they are
regression guards.

The `tedrisat:test` suite and the whole gate were each run twice; neither flaked in these runs.

## What was NOT verified

- **No live Keycloak.** Every e2e case runs against the stubbed `AuthGuard` from
  `test-app.helper.ts`, which injects a fixed `sub`. The change is downstream of the guard and
  reads only `request.user.sub`, so this exercises the authorization decision faithfully, but
  nothing here proves anything about token verification itself.
- **No `xlsx` export case.** The export test asks for `format=csv` so the body can be checked
  for leaked card text as a string. The `xlsx` branch of `exportFlashcards` is unchanged by
  this task and is not covered.
- **`libs/services/swagger-docs/tedrisat.json` was not regenerated.** The new
  `@ApiForbiddenResponse`/`@ApiNotFoundResponse` decorators therefore do not appear in the
  checked-in spec or the generated client. Nothing in CI diffs that file today; regenerating it
  is MDRS-58's deliverable.
- **Nothing was verified against a deployed environment.** Local gate only.
- **No concurrency/TOCTOU case.** `assertOwner` and the subsequent write are separate
  statements, not one transaction — see the follow-up below.

## What this does NOT close — read this before trusting the export half

The `/security-review` pass on this branch raised two HIGH findings against surrounding routes.
Both are real, both were confirmed against the code, and **both are deferred rather than
fixed** — so the honest summary of this change is: *the write hole is closed on the four named
handlers; the confidentiality hole is closed only on the export URL, not on the data.*

1. **`GET /flashcard/cards?deckId=` returns the same data the export route now refuses.**
   `FlashcardRepository.findByDeckId` filters on `eq(flashcards.deckId, deckId)` and nothing
   else, under the same `@UseGuards(AuthGuard)`. `exportFlashcards` literally calls it and then
   projects three columns — so the unguarded read returns a strict superset of what the guarded
   export returns. Any authenticated user with a victim's deck UUID can still read every card
   in a private deck; they just do not get a `.csv` wrapper.

   It is deferred because scoping that read means **deciding public/shared read semantics**,
   which is MDRS-45's deliverable, not a mechanical guard: `addToUserCollection` does not check
   `isPublic`, so a naive `authorId OR isPublic` predicate would break reading a deck somebody
   legitimately collected. Getting that wrong is worse than the status quo. `assertOwner` is now
   in place for whoever picks it up, and the sibling it needs is an `assertVisible`.

2. **`PUT` / `PATCH` / `DELETE /flashcard/cards/:id` have no ownership check and do not even
   take `@Req()`.** They pass the card id straight to
   `db.update(flashcards).where(eq(flashcards.id, id))` / `db.delete(...)`. Alone this needs an
   unguessable card UUID; **chained with item 1 it does not** — the unguarded read hands the
   attacker every card id in the deck, and they can then empty or silently rewrite it. So this
   change stops an attacker *inserting* into a victim's deck while leaving them able to
   *destroy* its contents from the same starting position.

   Deferred because these are card-entity routes, not the deck-scoped bulk/export surface this
   task names, and they want their own e2e block.

Neither is a regression; both predate this branch and remain on `main` after it lands.

## Follow-ups

None of these were opened as Linear issues; per repo convention they are recorded here and in
the PR body for a human to file.

1. **`flashcard-deck.controller.ts` `PUT :id`, `PATCH :id` and `DELETE :id` are still
   unguarded.** They reach `deckService.update` / `deckService.delete`, both of which filter on
   `decks.id` alone — `FlashcardDeckRepository.update` even carries a `// TODO?: verify deck
   author`. This task's "Work" section names four handlers, all in `flashcard.controller.ts`,
   and the issue title bounds it to the bulk write and export paths, so these were left alone
   rather than quietly widening the diff into MDRS-43's territory. `assertOwner` is in place and
   these three are a three-line change each whenever that is picked up. **Read acceptance
   criterion 1 with this in mind: it is met for the deck-scoped card routes the issue
   analysed, not for the deck-entity routes.**
   The two `:id/collections` routes are correctly *not* candidates — they write `decks_users`
   keyed by the caller's own id, and requiring deck ownership there would break adding a public
   deck to your own collection.
2. **`FlashcardController.replace`, `update` and `deleteDeck` — the card-level routes.** See
   item 2 of the section above; this is a HIGH finding, not a housekeeping note.
3. **`GET flashcard/cards?deckId=` and `GET cards/:id`.** See item 1 of the section above. Also
   HIGH, and the reason the export guard should not be described as closing the read hole.
4. **nizam offers Export and Import on decks the caller does not own.**
   `apps/nizam/app/[locale]/decks/page.tsx` lists every deck visible to the user —
   `findAllVisibleToUser` is `isPublic OR authorId = me` — and `DeckCards` wires the export and
   import affordances unconditionally, so on another author's public deck both now end in a
   403 `DECK_FORBIDDEN` toast (`cards.tsx` handles the error; nothing crashes). The UI cannot
   gate on ownership today because `FlashcardDeckResponse` carries no `authorId`
   (`dto/flashcard-deck-response.dto.ts`), so the fix is a contract change first — add
   `authorId` to the response, regenerate the client (MDRS-58's exporter, #55) — and then hide
   the two actions when `deck.authorId !== session.user.sub`. Left for that PR rather than done
   here, because regenerating `libs/services/swagger-docs/tedrisat.json` in this branch would
   collide with #55's 87-file regeneration.
5. **The committed spec and generated client do not carry the new `403`/`404` responses.** Same
   root cause and same owner: #55 regenerates the spec from the live router metadata, so once
   it is rebased onto this change the four routes' new status codes (and the `422` on `bulk`
   that was already missing) land there without a hand edit here.
6. **TOCTOU.** `assertOwner` and the insert are two statements. A deck whose `authorId` changed
   between them — there is no code path that does this today — would let a stale decision
   through. Worth folding into a transaction if deck transfer ever exists.
7. **Relationship to MDRS-43.** MDRS-43 applies the `@Authz` matrix to these same endpoints and
   would supersede this change. This is therefore the **stopgap**: it closes a live hole on
   `main` now, in the idiom the repository already uses, without waiting for the matrix. If
   MDRS-43 lands afterwards, `assertOwner` should be removed from these four handlers in the
   same commit that adds `@Authz` to them, so authorization is not decided in two places.
   Acceptance criterion 3 asks for this to be stated in a comment on whichever issue lands
   second; a comment saying so is on MDRS-63 with the PR link.
