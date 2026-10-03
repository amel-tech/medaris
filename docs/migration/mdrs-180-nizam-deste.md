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
  `publish_decided_at` is read for the answered tab (filter and newest-first
  order), so it has `decks_publish_decided_at_idx` (btree; in the pgTable, in
  0043's SQL and snapshot, and dropped in the down script). 0043 is not merged
  anywhere, so the statement went into it rather than into a 0044.
  A refused deck stays private and may ask again: `POST
  /flashcard/decks/:id/publish-request` now accepts PRIVATE and REJECTED, and any
  new request or change of visibility clears the last answer.
- New table `deck_proposals` (a müderris's suggestion for a köşk deck: köşk,
  course, proposer, name, description, card type, status PENDING / ACCEPTED /
  REJECTED, reject reason, the deck it became).
- `src/deck-review/` (new module, `DeckReviewModule`). Authorization is in the
  service, like the archive's, not in `@Authz`: the matrix has no entity for it.
  - `GET /nizam/deck-publish-requests?status=PENDING|DECIDED&page=&limit=` — the
    list with both tab counts. SYSTEM_ADMIN only. The köşk paging shape: `page`
    from 1, `limit` 12 by default and at most 50 (`src/deck-review/paging.ts`).
    The counts are of every request, not of the page.
  - `GET /nizam/deck-publish-requests/:id/cards?all=` — three sample cards, or
    every card. The `audit_log` row (`deck.private-read`, scope `sample` or
    `all`, card count) is written before the cards are read. A deck with no
    request on record answers 404.
  - `POST …/:id/approve` (deck becomes public, owner notified) and `POST
    …/:id/reject {reason}` (deck stays private, owner notified, reason required
    and not blank). 409 `DECK_REQUEST_NOT_PENDING` when answered meanwhile. Both
    use the existing `DECK_PUBLISH_RESULT` notification (`outcome` `approved` /
    `rejected`, `deckTitle`, `reason`).
  - `GET /kosks/:id/decks/manage?page=&limit=` — shown köşk decks (card count,
    last change) and the waiting proposals, both cut by the same `page` and
    `limit` (same shape as above), with `decksTotal` and `proposalsTotal` counting
    every one. A nazım of the köşk or SYSTEM_ADMIN. (`GET /kosks/:id/decks`
    already exists for the talebe side, so this is a different path.)
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
  refusal reason shown on an answered request. "Daha fazla göster" reads the next
  page of the tab while the tab's count is larger than the list. A request that
  turns out to be gone (404 / 409) leaves the waiting list but is not added to
  "Karara bağlanan"; only an answer made on this screen is.
- `/kosks/:id/desteler` — nizam/30. Proposal cards (hidden when there are none),
  Kabul et (link to the form, `?oneri=<id>`), Reddet (same dialog), deck table with
  Kartları düzenle (the existing `/decks/:id/cards`) and Gizle (AlertDialog, not
  destructive). The two counts are the API's totals, and each list has its own
  "Daha fazla göster" while its total is larger than what is shown.
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

Two states are kept apart. The **gate on head `04900e4d`** (before the review
fixes) was run in a worktree with `--skip-nx-cache`; its figures are copied
below as they were reported and **were not re-run** on the fixed head, except
where a command is shown. The CI `Verify` job passed on `04900e4d`
(`gh pr checks 172`: `Verify  pass  7m53s`); it covers the Testcontainers suites
that are too slow to repeat here. The commands below were run **after** the
review fixes (page/limit on the three lists, `decks_publish_decided_at_idx`,
the "Karara bağlanan" count), each from the repository root unless a directory
is named, with the summary line it printed:

| Check | Command | Result on the fixed head |
| --- | --- | --- |
| Biome ratchet | `node tools/ci/biome-ratchet.mjs` | `errors 0 (baseline 0)`, `warnings 70 (baseline 70)`, `infos 22 (baseline 22)`, `no severity count exceeded its baseline` |
| tedrisat types | `cd apps/tedrisat && ./node_modules/.bin/tsc --noEmit -p tsconfig.json` | no output (clean); `libs/common` built first with `nx run common:build` |
| nizam-web types | `./node_modules/.bin/nx run nizam-web:typecheck` | `Successfully ran target typecheck for project nizam-web and 8 tasks it depends on` |
| Migration matches the schema | `cd apps/tedrisat && ./node_modules/.bin/drizzle-kit generate --name drift_probe` (with a dummy `DB_PASSWORD`; it wrote nothing) | `No schema changes, nothing to migrate` |
| OpenAPI spec and client | `cd apps/tedrisat && ./node_modules/.bin/ts-node --project tsconfig.json src/openapi/export-openapi.ts ../../libs/services/swagger-docs/tedrisat.json`, then `cd libs/services && ./node_modules/.bin/openapi-generator-cli generate -i swagger-docs/tedrisat.json -g typescript-fetch -o src/tedrisat/generated --additional-properties=typescriptThreePlus=true,supportsES6=true,npmName=@medaris/tedrisatapi` (the two steps of `pnpm run openapi:tedrisat`) | `export-openapi: wrote 130 paths`; `git diff --stat` shows only the two routes' `page` / `limit` and the two totals in the spec, and the same in `KosksApi.ts`, `NizamApi.ts` and `ManagedKoskDecksResponse.ts` |
| tedrisat unit | `cd apps/tedrisat && ./node_modules/.bin/vitest run test/unit/deck-review` | `Test Files  1 passed (1)`, `Tests  16 passed (16)` |
| tedrisat e2e (real Postgres) | `cd apps/tedrisat && ./node_modules/.bin/vitest run test/e2e/deck-review.e2e.spec.ts` | `Test Files  1 passed (1)`, `Tests  16 passed (16)` (14 before, two paging tests added) |
| nizam-web unit | `cd apps/nizam && ./node_modules/.bin/vitest run` | `Test Files  29 passed (29)`, `Tests  519 passed (519)` on the second run; the first run had one timeout in `account.spec.tsx` (a file this PR does not touch, 5.7 s under load) that passes alone: `Tests  23 passed (23)` |
| tedris-web unit | `cd apps/tedris && ./node_modules/.bin/vitest run` | `Test Files  3 failed \| 50 passed (53)`, `Tests  3 failed \| 530 passed (533)`: three slow public-page specs (`course-preview-page`, `course-page-states`, `public-intro-pages`; 37 s and 51 s under load, files this PR does not touch) failed; the same three files alone: `Tests  30 passed (30)` |

Figures from the gate on `04900e4d`, **not re-run**: `typecheck`, `build`,
`lint` and `module-boundaries` green; `test` green with tedrisat 1382 tests
(this includes the Testcontainers e2e files, hence not repeated), nizam-web 513
and tedris-web 533 (both re-counted above), 0 failures on the second run (see
"What was not verified" for the first).

- tedrisat `deck-review.e2e.spec.ts` (16 tests, real Postgres, minted tokens):
  lists and counts, pages of both lists with their totals (a page past the end
  is empty, `limit=many` is 400), 403 for everyone but SYSTEM_ADMIN, audit rows for sample and
  all cards, 404 for a private deck with no request, approve (public, anonymous
  `GET /flashcard/decks` carries it, owner notified, second answer 409), reject
  (blank reason 400, reason kept, owner notified), a refused deck asks again,
  proposals (who may propose, accept with the deck in one step, second use 409,
  reject, notification), hide into the köşk's archive and Geri al.
  `test/unit/deck-review/` pins the service's authorization, its order of
  audit-before-read and how `page` / `limit` become the rows read.
- nizam-web `test/deck-review.spec.tsx` (rendering, form rules, the paging
  helpers and the tab counts, the three languages carrying the same keys).
- Playwright `e2e/deck-review.e2e.ts`, 10 tests passed (run on this branch
  before the review fixes; its command and output were not recorded, and it was
  **not re-run** after them: it needs the whole local stack and a Keycloak
  login) against a real tedrisat,
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

- **A failure in the first full `test` run that was not explained.** The first
  `-t test` run on `04900e4d` failed once, in `course-team.e2e.spec.ts`
  (withdraw-pending, got 405). That file is not touched by this PR; it passed
  35/35 on its own and on the full re-run, so it looks load-flaky, but the cause
  was not found. The "0 failures" above is the second run's.
- The Playwright run and the Testcontainers suites of tedrisat as a whole were
  not repeated after the review fixes (see the table above for what was).
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
