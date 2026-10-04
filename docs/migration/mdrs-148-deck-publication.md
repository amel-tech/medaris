# MDRS-148 — Decks are published only through the başnazım; he reads a private deck read-only, audited

Stacked on MDRS-135 (#177) and MDRS-205 (#197), tip `4e039281`. No migration. Most of the issue existed on
this tree already: MDRS-164 and MDRS-180 built the request flow and the nizam list, MDRS-135 built
`platform.deck_publish` and the audited read exception (`AuthzService.adminCan`). What was missing was the
point of the issue: **an owner could still publish his own deck** by sending `isPublic: true`, and the başnazım
could not take a published deck back. The rest was tests that did not exist. Every number below was read off
a command's output; commands run from the repository root unless a `cd` says otherwise.

## What changed

**Self-publication is closed (tedrisat).**
- `isPublic` is gone from `CreateFlashcardDeckDto` (and so from `UpdateFlashcardDeckDto`, which derives from
  it). The validation pipe forbids unknown properties, so a body that carries it, `true` or `false`, is a 400
  on `POST /flashcard/decks`, `PUT` and `PATCH /flashcard/decks/:id`.
- `FlashcardDeckRepository.create` always writes `is_public = false`, `publish_status = PRIVATE`; `update`
  no longer touches visibility. `approve` in `DeckReviewRepository` is the only writer of `is_public = true`.
- The owner's "Özel yap" on a published deck goes through a new `setPrivate` (the old way was
  `update({isPublic:false})`).

**The başnazım unpublishes (tedrisat, nizam).**
- `POST /nizam/deck-publish-requests/:id/unpublish`, body `{reason}` (the `RejectReasonDto` the siblings use:
  required, not blank, at most 1000), 204, `operationId: unpublishDeck`. 403 `DECK_REVIEW_FORBIDDEN` for
  anyone but SYSTEM_ADMIN (a Medaris nazımı holding `platform.deck_publish` included), 404 for a missing
  deck, 409 `DECK_NOT_PUBLISHED` when the deck is not published. A hidden (archived) published deck is taken
  back like any other: `hide` sets `archived_at` and nothing else, so the deck is still public.
- One transaction: `UPDATE decks ... WHERE publish_status = 'PUBLISHED'` (is_public false, status PRIVATE,
  every decision column null) and the `audit_log` row `deck.unpublish` (`details: {title, owner, reason}`). The
  decision columns are wiped, as on every change of visibility, so the row is the only record of who took the
  deck down and why; it is written with the change or the change does not happen.
- The owner is told: `DECK_PUBLISH_RESULT` with `outcome: "unpublished"` and the reason (the tr/en/ar copy
  and its pin in `apps/tedris/test/notification-view.spec.ts` existed already; only the producer was missing).
- nizam: "Yayından kaldır" on a published row of the "Karara bağlanan" tab, only when the viewer is the
  başnazım (`isBasnazim`, read from `/me` like `yasaklamalar/page.tsx`). It opens `RejectDialog` with a new
  kind `unpublish`; the dialog now reads its button and label per kind (`t.has`) so this kind says "Yayından
  kaldır" and "Gerekçe". The row leaves the list and the "Karara bağlanan" count drops. The legacy decks form
  loses its "Herkese açık" switch (`TableHeader.makePublic`, three locales).

**The owner's publish-request writes are guarded (tedrisat).** `setPublishRequest` (ask, withdraw a request)
wrote `WHERE id = ?`, so it could land after the başnazım's `approve` and leave `is_public = true` under
`publish_status = PRIVATE` (or `REJECTED`): a public deck that the owner's withdraw, the başnazım's unpublish and
`approve` all refuse to touch. It now carries the status the service read (`WHERE id = ? AND publish_status =
?`); a row that moved answers 409 `DECK_PUBLISH_STATE_CONFLICT` with the status it has now, or 404 if it is gone.
`approve` stays the only writer of `is_public = true`; the owner's `setPrivate` is unconditional by design (it
is the owner taking a deck down, whatever it is).

**The başnazım's read exception, hardened.** It lets him read someone else's private deck and its cards,
one `deck.admin_read` row per read (unchanged engine code, now tested route by route). Two routes let a
write through the exception and now refuse:
- `POST /flashcard/decks/:id/collections` asked `deck.view`, so the guard passed him and the handler collected
  the deck into his own list. The handler now asks the read rule again without the exception
  (`assertReadable`): 403 `DECK_FORBIDDEN`, no `decks_users` row.
- `PUT /flashcard/cards/progress` returned early for SYSTEM_ADMIN. The shortcut is gone: his progress on
  someone else's private deck is a 403, as for everyone.

**Audit page kinds.** `deck.admin_read` joins `deck.private-read` under the "private deck read" kind (it fell
under "Diğer"); `deck.unpublish` is in the `HIDE` kind (`%.hide`, `%.restore`). No new kind, so no new label.

**Stale texts corrected:** the `DeckReviewService` class comment, the list route's description (it is in the
OpenAPI spec), the nizam page comment, the unit test title "are the başnazım's alone", and
`docs/migration/mdrs-180-nizam-deste.md` (three places).

## Behaviour changes callers will see

| Who / what | Before | Now |
| --- | --- | --- |
| any client sending `isPublic` on `POST /flashcard/decks`, `PUT`, `PATCH /flashcard/decks/:id` | accepted; `true` published the deck on the spot | 400, nothing written |
| a deck made through the API | private unless `isPublic: true` | always private |
| the generated client | `CreateFlashcardDeckDto.isPublic`, `UpdateFlashcardDeckDto.isPublic` | both gone |
| nizam legacy decks form | "Bu sunumu herkese açık yap" switch | no switch |
| the başnazım, `POST /flashcard/decks/:id/collections` on someone's private deck | 201, a row in his collection | 403; the guard still writes its one `deck.admin_read` row (it cannot tell this route's collect from a read without a new permission code) |
| the başnazım, `PUT /flashcard/cards/progress` on cards of someone's private deck | 200, progress written | 403 `AUTHZ_FORBIDDEN`, nothing written |
| the başnazım, `PUT /flashcard/cards/progress` with an unknown card id | skipped the check (FK error) | 404 `CARD_NOT_FOUND`, as for everyone |
| the başnazım, same route, a private deck that is not his and not shared with him (a köşk deck of a köşk he is not in) | allowed | 403 |
| the owner's "Yayın iste" / "Özel yap" on a request, racing the başnazım's answer | the later write won, possibly leaving `is_public` and the status disagreeing | 409 `DECK_PUBLISH_STATE_CONFLICT`, the row is as the başnazım left it |
| a published deck | could only be taken back by its owner | the başnazım may too (`unpublish`); the owner gets a notification with the reason |
| the audit page | `deck.admin_read` listed under "Diğer" | listed under the private-deck-read kind; `deck.unpublish` under the hide kind |
| the OpenAPI description of `GET /nizam/deck-publish-requests` | "SYSTEM_ADMIN only" | "the başnazım, or a Medaris nazımı holding platform.deck_publish" (what the code has done since MDRS-135) |

Not changed, and worth the owner knowing: **hiding a deck does not take it off the public reads.** A köşk deck
that was published and then hidden (`POST /decks/:id/hide`, `archived_at` only) stays readable by anyone through
`GET /flashcard/decks`, `GET /flashcard/decks/:id` and the cards route: the anonymous resolver, `findAll` and the
authenticated resolver look at `is_public` alone (the köşk list and the owner's summary lists do filter
`archived_at`). That predates this issue (MDRS-135 `hide`). Making every public read respect `archived_at` is the
wider fix and touches the resolver, the lists and the köşk reads, so it is left to the owner's call; what this
issue guarantees is that the başnazım can take such a deck back (`unpublish` answers 204, not 404, for it).
Also: SYSTEM_ADMIN still writes to **someone else's public deck**
(rename, delete, add cards) through the realm bypass; the issue's exception is about private decks and
`adminCan` says so (`libs/common/test/authz/authz.service.spec.ts:119` pins it). Nothing here narrows it.

## Decided by the owner (already recorded)

- No migration; no public deck exists (3 Oct). A published deck shows no author (no screen has a
  "Hazırlayan"; the opaque `authorId` stays in the response, see D5).
- The başnazım may unpublish with a reason and a notice to the owner (3 Oct; d-1001-38 "evet, gerekçeyle ve
  sahibine bildirimle").

## Decided by default, owner may overrule

| | Default taken | Alternative |
| --- | --- | --- |
| D1 who may unpublish | the başnazım only | also a Medaris nazımı holding `platform.deck_publish`; or a new code `platform.deck_unpublish` (76 -> 77: golden spec, three locales, dialogs). The terms of use already say "Medaris başnazımı ... yayından kaldırabilir" |
| D2 closing self-publication | the field is removed, any body carrying it is a 400 | accept and ignore it; or accept only `false` (`@IsIn([false])`), a smaller test change at the price of a dead field |
| D3 the two side doors (collect, progress) | refused | allow them as "his own state" |
| D4 public decks that exist when this lands | nothing is deleted; the count query below | a data migration deleting `is_public AND publish_decided_by IS NULL` |
| D5 `authorId` on the wire for every reader | left (tedris needs it for `isOwner`) | blank it for non-authors, as `forViewer` does for `tags` |
| audit kind of `deck.unpublish` | `HIDE` (no new label key) | a kind of its own (label in `nizam.json`, `AUDIT_TYPE_OPTIONS`) |

D4's query, read-only, for the owner or ops to run on dev and on production before this ships:

```sql
select id, author_id, title, publish_status, publish_decided_by from decks where is_public;
```

A deck published through approval has `publish_decided_by` set; one made public through the old `isPublic`
has it null. I could not run it against a real database (only Testcontainers), so whether any exists is
not verified. The owner says none does.

## Where the planner's cut or the dossier was wrong or loose

- Dossier: "26 call sites in 7 specs". The sends that carried `isPublic` are gone from `flashcard-bulk`
  (the largest), `flashcard-deck-public`, `flashcard-deck-summary`, `flashcard-export`, `flashcard-label`,
  `throttler` and `authz-engine`; the `isPublic: true` DB inserts of `discover`, `flashcard-study` and
  `flashcard-deck-summary` are not HTTP bodies and are unchanged. Remaining `isPublic` sends in `test/e2e`:
  the 400 assertions only (`git grep` below).
- Planner: "harden `assertProgressTargetsVisible` for someone else's private deck". I removed the SYSTEM_ADMIN
  shortcut altogether rather than narrowing it: the generic rule already allows the author, a public deck
  and a deck shared with the caller, so nothing the başnazım may legitimately do is lost. The side effects
  are in the table above (unknown card 404 instead of an FK error; a private köşk deck he is not in).
- Planner: refuse the collect "in the handler or the service". Done in the controller, one line, before the
  service call, because the service call is the write.
- Dossier criterion 3 said the nizam list for Medaris nazımları was untested; it is now
  (`deck-publication.e2e.spec.ts`), with a grant, a revoked grant, an expired grant, a grant without the role
  and a role without the grant.
- Dossier "a `makePublicDeck`-style helper": it is `TestDatabaseUtils.publishDeck` in
  `test/helpers/test-database.helper.ts`.

## Tests, and what each one fails without

All tedrisat specs ran through `/home/taha/medaris-wt/.bin/e2e-slot.sh` against Testcontainers Postgres.
Red means: the one source change named was put back, the named spec run, the file restored.

| Criterion (Linear AC or dossier row) | Test | Red with the source change put back |
| --- | --- | --- |
| AC1 "Yayın iste" leaves the deck private; after the başnazım publishes, an anonymous caller reads it (deck, cards, list) | `deck-publication.e2e.spec.ts` "asks, stays private, is published by the başnazım, and goes private again at once when the owner says so" | see AC2 (one test is both) |
| AC2 the owner makes a published deck private, anonymous reads answer 404 at once | same test; `flashcard-deck-summary.e2e.spec.ts` "lets the author turn a published deck private again ..." | `setPrivate` without `isPublic: false`: both fail (2 failed of 44) |
| 5 / D2 the owner cannot publish by himself | `deck-publication.e2e.spec.ts` "answers 400 to a body sending isPublic true/false on POST, PUT and PATCH, and the deck does not move" (2), `flashcard-deck-summary.e2e.spec.ts` "refuses a body that sends isPublic" (2), `flashcard-bulk.e2e.spec.ts` "keeps every owner scope on the owner's own PUBLIC deck" (the PATCH 400) | `isPublic` put back on the DTO: 5 failed of 78 |
| AC3 a Medaris nazımı without the permission cannot publish (403) | `deck-publication.e2e.spec.ts` "refuses a Medaris nazımı without the permission: list, cards, approve, reject"; "counts a revoked grant and an expired one for nothing"; "counts a grant without the Medaris nazımı role for nothing"; "does not let the owner answer his own request" | these pin the refusal, which was already the code; no change makes them fail except opening `assertChief` (not run) |
| AC3 ... and with it they can | "lets the holder list, read the cards on the record, and approve", "lets the holder refuse a request, with a reason"; unit "are open to a nazım holding platform.deck_publish" | `assertChief` without the grant branch: 2 failed of 17 (e2e), 1 failed of 21 (unit) |
| AC4 the başnazım reads another user's private deck and its cards, each read writes a row | `deck-admin-read.e2e.spec.ts` "GET /flashcard/decks/:id", "GET /flashcard/cards?deckId=", "GET /flashcard/cards/:id", "GET /flashcard/decks/:id/due" each answers 200 and writes exactly one `deck.admin_read` row (actor, deck id, owner in details); "writes one more row for every further read"; "leaves the owner's own reads off the record" | `adminCan` without its `record` call (libs/common, dist rebuilt): 6 failed of 26 |
| AC4 every write by the başnazım is refused | `deck-admin-read.e2e.spec.ts`, 13 routes (PUT, PATCH, DELETE deck; POST, DELETE publish-request; POST cards, bulk, bulk/import; GET bulk/export; PUT, PATCH, DELETE card; PUT progress), each 403 with no audit row, deck and cards unchanged, no collection and no progress row | `adminCan` without the `DECK_VIEW` check: 12 failed of 26 (the 12 routes decided by `adminCan`); progress shortcut put back: 1 failed (e2e), 1 failed (unit `flashcard.service.spec.ts`) |
| collecting a private deck (D3) | `deck-admin-read.e2e.spec.ts` "POST /flashcard/decks/:id/collections answers 403 and collects nothing" (and still one `deck.admin_read` row, stated in the test) | `assertReadable` call removed: 1 failed of 26 |
| AC5 any other user still gets 404 on someone else's private deck | `deck-admin-read.e2e.spec.ts` "answers a stranger 404 on every read route, with no row" and the same for a Medaris nazımı holding `platform.deck_publish` | the resolver letting a non-owner through: 2 failed of 26 |
| 10 the başnazım unpublishes: 204, deck private, decision columns null, anonymous 404, owner notified, one audit row | `deck-publication.e2e.spec.ts` "takes the deck back to private, tells the owner the reason, and leaves one audit row" | no audit insert: 2 failed; no notification: 2 failed (e2e) and 1 failed (unit); decision columns not wiped: 1 failed |
| 10 reason required | "needs a reason: missing, blank or empty is a 400 and the deck stays published" | the DTO is `RejectReasonDto`, shared and already pinned by the reject route; not run separately |
| 10 only the başnazım | "is the başnazım's alone: the owner, a stranger and a nazım holding platform.deck_publish get 403" (and 401 with no token); unit "is the başnazım's alone, even for a nazım holding platform.deck_publish" | no admin check: 1 failed (e2e), 1 failed (unit) |
| 10 409 `DECK_NOT_PUBLISHED`, no second row or notice; private, waiting and refused decks 409; missing 404; the owner may ask again | "answers 409 DECK_NOT_PUBLISHED the second time ...", "answers 409 for a private, a waiting and a refused deck ...", "lets the owner ask again, and the cards survive"; unit "answers 409 for a deck that is not published ...", "answers 404 for a missing deck" | no status check in the service: unit 1 failed, **e2e 0 failed** (the repository's `WHERE publish_status = 'PUBLISHED'` makes it an equivalent change; the service check is there so a refusal does not notify, which the unit test pins) |
| review fix: a hidden published deck can be unpublished (it is still public; `hide` sets `archived_at` only) | `deck-publication.e2e.spec.ts` "takes a hidden deck back too, as hiding does not make a deck private, and answers 404 for one that is not there" (anonymous GET 200 before, 404 after, one audit row); unit "takes a hidden published deck back as well" | the service's `archivedAt` 404 put back: e2e 1 failed (got 404, expected 204), unit 1 failed |
| review fix: the owner's ask / withdraw cannot overwrite an answer that landed after his read (no `is_public` and status disagreeing) | `deck-publication.e2e.spec.ts` "the owner's write against a stale read": "does not take a request back that the başnazım has approved meanwhile", "... has refused meanwhile", "does not ask for a deck that is published meanwhile" (each: 409 `DECK_PUBLISH_STATE_CONFLICT`, row unchanged, no `is_public <> (status = PUBLISHED)` row); the chain test now also asserts that count is 0; unit "answers 409 with the status the deck has now ...", "answers 404 when the guarded write finds the deck gone" | the repository's `AND publish_status = ?` taken out of `setPublishRequest`: 3 failed of 20 (before the fix, on the original code: 3 failed of 20, got 200/201 instead of 409). The race is staged, not run: `findById` answers the stale status once while the row already holds the answer. The chain-test invariant assertion was not run red (no sequence in it produces the split row once the guard is there) |
| audit kinds | `test/unit/audit/audit.spec.ts` rows `deck.admin_read` and `deck.unpublish` | each kind taken out of its rule: 1 failed of 43, each |
| nizam: the button only for the başnazım and only on a published row | `apps/nizam/test/deck-review.spec.tsx` "taking a published deck back" (3) and "Yayından kaldır" (3) | `canUnpublish` ignoring the viewer: 2 failed of 33; the view ignoring `isBasnazim`: 1 failed of 33 |
| nizam: the dialog's reason rule and `isGone("DECK_NOT_PUBLISHED")` | `isGone` and the error key: "knows DECK_NOT_PUBLISHED"; the dialog is the shared `RejectDialog` whose disabled-until-written rule is unchanged | the opened dialog cannot be rendered in the static markup (it lives in a portal); not tested here |
| tr/en/ar parity | `apps/nizam/test/deck-review.spec.tsx` "the three languages carry the same keys" (`DeckRequestsPage`, `DeckReject`) | not run red |
| the route inventory gets exactly the one new line | `authz-route-inventory.e2e.spec.ts` (updated with `-u`); `git diff` of the snapshot is the single line `POST /nizam/deck-publish-requests/:id/unpublish -> no AuthzGuard` | |

### Commands and their output

```
$ cd apps/tedrisat && ./node_modules/.bin/vitest run test/unit
 Test Files  63 passed (63)
      Tests  818 passed (818)
$ cd apps/tedrisat && e2e-slot.sh ./node_modules/.bin/vitest run test/e2e/deck-publication.e2e.spec.ts \
    test/e2e/deck-admin-read.e2e.spec.ts test/e2e/deck-review.e2e.spec.ts test/e2e/flashcard-bulk.e2e.spec.ts \
    test/e2e/flashcard-deck-public.e2e.spec.ts test/e2e/flashcard-deck-summary.e2e.spec.ts \
    test/e2e/flashcard-export.e2e.spec.ts test/e2e/flashcard-label.e2e.spec.ts test/e2e/flashcard-study.e2e.spec.ts \
    test/e2e/discover.e2e.spec.ts test/e2e/throttler.e2e.spec.ts test/e2e/authz-engine.e2e.spec.ts \
    test/e2e/authz-route-inventory.e2e.spec.ts test/e2e/platform-admin.e2e.spec.ts \
    test/e2e/dto-validation.e2e.spec.ts test/e2e/nizam-dashboard.e2e.spec.ts
 Test Files  16 passed (16)
      Tests  363 passed (363)
$ cd apps/nizam && ./node_modules/.bin/vitest run
 Test Files  38 passed (38)
      Tests  645 passed (645)
$ cd apps/tedrisat && tsc --noEmit --incremental false -p tsconfig.json     # rc=0 (it excludes *.spec.ts)
$ cd apps/nizam && tsc --noEmit                                              # rc=0, after building libs/i18n, libs/services, libs/ui, libs/utils with tsc -b
$ cd apps/tedris && tsc --noEmit                                             # rc=0
$ pnpm run openapi:tedrisat && node tools/ci/assert-openapi-spec-fresh.mjs
✔ openapi spec freshness: 168 paths, identical to what the exporter writes today (info.version excluded by design).
$ node tools/ci/biome-ratchet.mjs
✔ biome-ratchet: no severity count exceeded its baseline.   (errors 0, warnings 70, infos 21: the baseline)
$ git grep -n "isPublic" apps/nizam/features apps/nizam/app apps/tedris/features | grep -v "deck.isPublic"
(no match: no sender of the field in the web apps; tedris reads `deck.isPublic` from the response only)
```

The two new specs are 20 (`deck-publication`) and 26 (`deck-admin-read`) tests. The Playwright specs
(`apps/nizam/e2e`) were not run: they need the whole local stack.

## What was not verified

- The full tedrisat suite (about 17 minutes) and the web suites of `nazir` and `tedris`: the integrator's. I ran
  the unit directory, the 16 e2e files above, and nizam's whole suite.
- `pnpm nx run-many -t build lint module-boundaries`: not run; `biome check` on every touched file, the
  ratchet and `tsc` are.
- A native reader has not seen the Arabic strings (plain translations, as the brief allows).
- Two writers really racing on one deck: the owner's ask / withdraw against the başnazım's answer is tested
  with a staged stale read (one request, `findById` answering the old status), not with two requests in flight.
  The başnazım's unpublish against the owner's "Özel yap" (`WHERE publish_status = 'PUBLISHED'`, at most one
  audit row) has no test that runs two requests at once.
- Public reads of a hidden deck (see "Not changed" above): still served; not touched by this issue.
- A real Keycloak, Bunny or YouTube: none is involved.
- Whether a public deck exists on dev or production (D4).
- The deck-owner's tedris screens (`deck-owner-overview.tsx`) were not run in a browser: nothing in them
  changed, and they send no `isPublic`.
