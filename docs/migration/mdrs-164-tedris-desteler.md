# MDRS-164 — tedris deck screens

Designs tedris/25 (Desteler), 26 (Desteleri keşfet), 27 (Deste oluştur), 28
(Deste ayrıntısı, sahibi), 29 (Deste kartları), 31 (okuyan kişinin görünümü) and
33 (Desteyi düzenle).

## What was done

- **tedrisat** (migration `0032_decks_summary`): `decks` gains `card_type`,
  `publish_status`, `publish_requested_at`, `tags text[]`, `course_id`,
  `madrasah_id`. Existing public decks are backfilled to PUBLISHED, and each
  deck's type to its cards' majority type.
- New endpoints: `GET /flashcard/decks/summary` (own + collected decks with
  the caller's progress), `GET /flashcard/decks/explore?cardType=`,
  `POST` and `DELETE /flashcard/decks/:id/publish-request`. `POST
  /flashcard/decks` takes `cardType` and `tags`; `isPublic` is optional;
  `PATCH` refuses `cardType`; the description's 10-character minimum is gone;
  collecting a deck twice is no longer an error.
- A deck that belongs to a course, köşk or medrese (`deckSharedWith`) is
  readable, collectable and studyable by talebe enrolled (ENROLLED or
  COMPLETED) in that course, in a course of that köşk or in a course of that
  medrese; never writable. Resolver, card visibility, progress writes and
  `findAllByUser` share one SQL fragment.
- **tedris-web**: the five deck pages are rewritten on the kit (`Decks`
  catalogue, `/decks/(medaris)` route group); the old shadcn deck pages, forms
  and hooks are deleted. `/api/decks/[id]/export`, `/[id]/import` and
  `/sample` hand files to tedrisat with the caller's token.
- **i18n**: one `Decks` namespace in tr/en/ar; four unused namespaces
  (KeycloakLogout, KoskListPage, LearningPage, Validation) removed.
- `libs/services` client regenerated; `tools/ci/biome-baseline.json` lowered
  to 71 warnings / 22 infos.

## What was verified

- Gate in the worktree, all `--skip-nx-cache`: typecheck 17 projects, test 11
  projects (tedrisat 1064 tests, tedris-web 373 tests, per the JUnit files),
  build 8 projects, lint 17, module-boundaries 17; `biome-ratchet` 71/22
  against baseline 72/23; `assert-openapi-spec-fresh` 83 paths identical.
- Playwright `apps/tedris/e2e/decks.e2e.ts`: 26 of 26 against the real API,
  Postgres and Keycloak, signed in as `e2e-talebe`. Covers every acceptance
  criterion of the seven specs that a talebe can reach.
- The browser run found a real leak the API suite had not: in the
  `deckSharedWith` subquery drizzle wrote the bare `course_id`, which bound to
  `enrollments.course_id`, so any enrolled talebe could read any private deck.
  Fixed (columns written `"decks"."…"`) with a regression case in
  `flashcard-deck-summary.e2e.spec.ts`.
- Screens compared by eye with `ekran.png` at 1440 px (25, 26, 27, 28, 29, 31,
  33) and with `ekran-telefon.png` at 390 px (25).

## What was not verified

- Phone layout of 27, 28, 29, 31 and the dialogs; dark theme; Arabic (rtl) UI
  and the English/Arabic wording (written, not read by a speaker).
- Anything needing another role (köşk nâzımı, SYSTEM_ADMIN) — no screen here
  does.
- A real course/köşk/medrese deck made through the product: no endpoint links a
  deck, so the specs seed rows with SQL. Medrese decks have a badge and a column
  but no data.
- Review of a publication request: there is no approve/reject endpoint yet.
  `isPublic` is still accepted on create/update, so an author can publish
  through the API; close it when the review endpoint lands.
- "Tekrar bekliyor" is the learning count (no review time is stored).

## Merge notes

- Migration 0032 collides with `release/stack-31`'s 0032; renumber one (journal
  and snapshot too) when the branches meet.
- The tedris message catalogue is at the edge of TypeScript's TS2589: 797 keys
  failed to compile `t.rich`, 742 compiled; it is 730 now.
