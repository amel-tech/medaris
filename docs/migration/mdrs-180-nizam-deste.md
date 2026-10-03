# MDRS-180 — Deste yayın istekleri, Köşk desteleri, Köşk destesi aç

Screens: nizam/16 "Deste yayın istekleri", nizam/30 "Köşk desteleri", nizam/35
"Köşk destesi aç" (stack-50, `nizam-deste`). Coded on top of the stack top at the
time (`release/stack-46-nizam-ders-celse`, position 49 of stack #130).

## What was done

**tedrisat** — migration `0043_deck_review_and_proposals` (journal tag 0043; the
number was reserved in `migration-rezerv.txt`). `drizzle-kit generate` numbers by
journal length and would have written `0041`, which already exists: the SQL, the
snapshot (`meta/0043_snapshot.json`, `prevId` = 0042's id) and the journal entry
were renamed to 0043 by hand and the overwritten `0041_snapshot.json` was
restored. Down script in `src/database/rollbacks/`.

- `decks.publish_decided_at`, `publish_decided_by`, `publish_reject_reason`, and
  `DeckPublishStatus.REJECTED` (the column is `text`, so the value needs no DDL).
  A refused deck stays private and may ask again: `POST
  /flashcard/decks/:id/publish-request` now accepts PRIVATE and REJECTED, and any
  new request or change of visibility clears the last answer.
- New table `deck_proposals` (a müderris's suggestion for a köşk deck: köşk,
  course, proposer, name, description, card type, status PENDING / ACCEPTED /
  REJECTED, reject reason, the deck it became).
- `src/deck-review/` (new module, `DeckReviewModule`). Authorization is in the
  service, like the archive's, not in `@Authz`: the matrix has no entity for it.
  - `GET /nizam/deck-publish-requests?status=PENDING|DECIDED` — the list with
    both tab counts. SYSTEM_ADMIN only.
  - `GET /nizam/deck-publish-requests/:id/cards?all=` — three sample cards, or
    every card. The `audit_log` row (`deck.private-read`, scope `sample` or
    `all`, card count) is written before the cards are read. A deck with no
    request on record answers 404.
  - `POST …/:id/approve` (deck becomes public, owner notified) and `POST
    …/:id/reject {reason}` (deck stays private, owner notified, reason required
    and not blank). 409 `DECK_REQUEST_NOT_PENDING` when answered meanwhile. Both
    use the existing `DECK_PUBLISH_RESULT` notification (`outcome` `approved` /
    `rejected`, `deckTitle`, `reason`).
  - `GET /kosks/:id/decks/manage` — shown köşk decks (card count, last change) and
    the waiting proposals. A nazım of the köşk or SYSTEM_ADMIN. (`GET
    /kosks/:id/decks` already exists for the talebe side, so this is a different
    path.)
  - `POST /kosks/:id/decks {title, description?, cardType, proposalId?}` — opens
    the deck (`decks.kosk_id`, private to everyone but the köşk's talebe through
    `deckSharedWith`). With `proposalId` the proposal is accepted in the same
    transaction; one answered meanwhile rolls the deck back (409
    `DECK_PROPOSAL_NOT_PENDING`).
  - `POST /kosks/:id/deck-proposals` (a müderris of one of the köşk's courses) and
    `POST /kosks/:id/deck-proposals/:proposalId/reject {reason}`; the rejection
    reaches the proposer as a `DECK_PUBLISH_RESULT` with `outcome:
    proposal_rejected`.
  - `POST /decks/:id/hide` — Gizle: `archived_at` / `archived_by` on a köşk deck.
- The archive now sees köşk decks: its hidden-items query returned `null` for a
  deck's köşk, so a hidden köşk deck was in no köşk's archive; it returns
  `decks.kosk_id`, and a köşk manager may restore a deck of their köşk (Geri al).
- OpenAPI spec and the generated client regenerated (two generated model names
  clashed with the talebe-side `KoskDeckResponse` / `KoskDecksResponse`; the new
  ones are `ManagedKoskDeckResponse` / `ManagedKoskDecksResponse`).

**nizam-web** (`features/deck-review/`, new)

- `/talepler/deste-yayin-istekleri` — nizam/16. The menu entry already pointed
  there. Tabs with the API's counts, list beside a detail, sample cards loaded only
  once a request is selected (each load is an audit row), "Bütün kartlar",
  Yayımla, Reddet (dialog, "Ret gerekçesi*", button disabled until written), the
  refusal reason shown on an answered request.
- `/kosks/:id/desteler` — nizam/30. Proposal cards (hidden when there are none),
  Kabul et (link to the form, `?oneri=<id>`), Reddet (same dialog), deck table with
  Kartları düzenle (the existing `/decks/:id/cards`) and Gizle (AlertDialog, not
  destructive).
- `/kosks/:id/desteler/yeni` — nizam/35. Banner and fields filled in from the
  proposal, Kelime / Hadis radio with the side-panel preview of the chosen type,
  "Kimler görür" with the köşk's `studentCount`, empty name refused inline.
- The sidebar's "Köşk desteleri" entry now points at `/kosks/:kosk/desteler`
  instead of the personal `/decks` page.

**tedris-web** — a refused deck reads "Yayın isteği reddedildi" (badge on the
deck, the deck list and its header); under the "Özel" chip, since it is private.
Without this the new status broke `typecheck` there.

**i18n** — `DeckRequestsPage`, `DeckReject`, `KoskDecksPage`, `KoskDeckForm` in
`nizam` (tr, en, ar), `statusREJECTED` in `tedris`, and a `proposal_rejected`
branch in `DECK_PUBLISH_RESULT`'s three messages.

## What was verified

Gate in this worktree, all `--skip-nx-cache`: `typecheck`, `test`, `build`,
`lint`, `module-boundaries` and `tools/ci/biome-ratchet.mjs` green (warnings 70,
baseline 70). `test`: tedrisat 1382, nizam-web 513, tedris-web 533 tests, 0
failures.

- tedrisat `deck-review.e2e.spec.ts` (14 tests, real Postgres, minted tokens):
  lists and counts, 403 for everyone but SYSTEM_ADMIN, audit rows for sample and
  all cards, 404 for a private deck with no request, approve (public, anonymous
  `GET /flashcard/decks` carries it, owner notified, second answer 409), reject
  (blank reason 400, reason kept, owner notified), a refused deck asks again,
  proposals (who may propose, accept with the deck in one step, second use 409,
  reject, notification), hide into the köşk's archive and Geri al.
  `test/unit/deck-review/` pins the service's authorization and its order of
  audit-before-read.
- nizam-web `test/deck-review.spec.tsx` (rendering, form rules, the three
  languages carrying the same keys).
- Playwright `e2e/deck-review.e2e.ts`, 10 tests passed against a real tedrisat,
  a real Postgres and the real Keycloak with the `e2e-sistem-admin`,
  `e2e-kosk-nazim`, `e2e-muderris` and `e2e-talebe` accounts: counts equal the
  table's, sample cards and "Bütün kartlar" each write an audit row, Yayımla
  makes the deck appear in the anonymous list, Reddet is disabled until a reason
  is written, Kabul et fills the form and the deck then appears while the
  proposal leaves, an empty name is refused, a deck from scratch is listed, Gizle
  puts the deck in the köşk's archive, a köşk nazımı sees the 403 screen on
  nizam/16 and a talebe on nizam/30 and 35.
- The three pages were compared with their canvases (screenshots at 1440 px).

## What was not verified

- **The local dev database on :5432 does not follow this branch.** tedrisat
  fails to boot against it (`ALTER TABLE "madrasahs" ADD COLUMN "archived_at"`
  already exists: another branch's migrations were applied there). The e2e ran
  against a throw-away `postgres:17-alpine` on :5450, migrated from scratch by
  tedrisat itself, which also proves migration 0043 applies on a fresh database.
  It was not applied on top of the shared database.
- **Who may answer a publish request.** SYSTEM_ADMIN only. The design names the
  permission "Desteyi herkese yayımla" (`platform.deck_publish`), but no endpoint
  in tedrisat enforces a platform permission yet (the same is true of every other
  platform grant); the Medaris nazımı's menu shows the entry and gets the 403
  screen until grants are enforced.
- The dark theme, the phone width and the Arabic (rtl) rendering of the three
  pages were not looked at. The Arabic strings are mine and were not reviewed by
  a native reader.
- The müderris's side: nothing in tedris-web or nizam-web lets a müderris
  *make* a proposal (there is no design for it); `POST …/deck-proposals` exists
  and is covered by the API tests. The proposer's notification text
  (`proposal_rejected`) was added to the three languages and checked by the key
  parity spec, not looked at in the tedris notifications page.
- "Kimler görür" prints the köşk's `studentCount`; whether that is the figure of
  talebe *enrolled in a course* (the design says so) was not checked against the
  query behind it.
- The köşk deck list shows no Arabic title (the canvas shows one beside the
  description; the deck model has no such field).
- Reading the cards of a *published* request writes an audit row too; the design
  only talks about private decks.
- The dev server of nizam-web streams a hidden copy of the page before it swaps
  it in; the Playwright specs therefore find the request list by role, which
  skips the hidden copy.
