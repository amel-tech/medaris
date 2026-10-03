# MDRS-165: Ana sayfa, Çalışma and the signed-out deck (stack-35)

Designs tedris/01 (Ana sayfa, talebe), tedris/30 (Çalışma, ezber kartı) and
tedris/32 (deste, girişsiz ziyaretçi), on top of `release/stack-34-tedris-desteler`.

## What was done

Backend (tedrisat)

- Migration `0037_flashcard_review_schedule`: `flashcard_progress` gains `due_at`,
  `reviewed_at`, `interval_days` and an index on `(user_id, due_at)`. (stack-31
  also uses 0032 for its own migration; renumber when the branches meet.)
- Review schedule, one function (`domain/review-schedule.ts`): HARD stays LEARNING
  and returns in 1 day; MEDIUM stays LEARNING, at least 3 days; EASY masters the
  card, gap doubles, at least 7 days, at most 180. Whether this is the algorithm
  the product wants is not decided; replacing the function changes nothing else.
- "Due" (`review-due.ts`): started and (`due_at` passed, or never set while LEARNING).
  A MASTERED row without a time (the old toggle) is never due. `dueCount` of the deck
  summary now uses it (it was the learning count).
- `PUT /flashcard/cards/progress` takes `rating` (`HARD|MEDIUM|EASY`) as well as
  `status`; with a rating the server decides state and time and ignores `status`.
- `GET /flashcard/decks/:id/due`: today's round (due cards first, at most 50, then
  at most 10 unstarted), each with the caller's progress row.
- `GET /flashcard/decks/due?limit=`: decks of the collection with cards waiting,
  then collected decks that grew since collecting (`limit` 3, at most 10).
- `GET /kosks/followed/courses?limit=`: published courses of followed köşks the
  caller has no enrollment in; an unlisted (`is_private`) or hidden köşk is in no
  list, so its courses are left out even for its followers (as `GET /kosks`).
- `GET /flashcard/cards?deckId=` is now `@AuthzPublic`: a public deck's cards are
  readable with no token (the deck itself already was, MDRS-45); a private deck is
  the same 404 as an absent one; a caller with no token gets no `progress`. This
  replaces the planned `/public/flashcard/decks/:id`, which would have duplicated
  `GET /flashcard/decks/:id`.

Web (tedris-web)

- `/home`: the sessions block laid out as in the design (two columns), plus
  "Kaldığın yerden devam et", "Bugün çalışılacak desteler" and "Takip ettiğin
  köşklerden", each its own Suspense boundary and its own read, so one failing
  shows an Alert with a retry while the rest stay. `/` redirects to `/home`.
- `/decks/study/[id]` moved into the unified `(medaris)` group and was rewritten:
  round counter, card face, flip (button or space), Zor/Orta/Kolay, summary at the
  end, "Çalışmayı bitir". A failed write is a toast and the card stays. The old
  shadcn flashcard components and hook were deleted.
- `/decks/[id]` and `/decks/study/[id]` are public paths (by UUID only, so
  `/decks/create` and `/decks/explore` stay protected). A visitor reads a public
  deck, studies its first 10 cards with nothing written, and is sent to sign in
  (and back) for a deck they cannot read, which says nothing about whether it exists.
- The deck overview's "Bugün N kart tekrar bekliyor" now counts the same way the API does.
- New message namespace `tedrisLearn` (tedris catalogue is at the TS2589 edge: 729
  keys before this package, 719 after; the 10 stale keys of the old study screen and
  `HomePage` were removed and the new keys went into their own file, 30 of them).
  Counted as leaf strings (`tr` shown; `en` and `ar` hold the same 719 and 30 at the
  package commit `254c36c3`), before and after it:

  ```
  $ for r in '254c36c3^' 254c36c3; do git show "$r:libs/i18n/src/locales/tr/tedris.json" | jq '[paths(scalars)] | length'; done
  729
  719
  $ git show 254c36c3:libs/i18n/src/locales/tr/tedris-learn.json | jq '[paths(scalars)] | length'
  30
  $ git diff 254c36c3^ 254c36c3 -- libs/i18n/src/locales/tr/tedris.json | grep -cE '^-\s+"[^"]+": "'
  10
  ```
- Client regenerated (`pnpm openapi:tedrisat`).

## What was verified

Case counts are `it(`/`test(` calls at the head of this branch; a count says how many
cases the file holds, not that they pass.

- tedrisat: new unit specs (schedule, due-today, rating in `replaceManyProgress`) and
  `flashcard-study.e2e.spec.ts` (real Postgres and guard):

  ```
  $ grep -cE '^\s*it\(' apps/tedrisat/test/e2e/flashcard-study.e2e.spec.ts
  14
  ```

  Run for the unlisted-köşk fix (this spec file only, Postgres in local Docker):

  ```
  $ cd apps/tedrisat && ./node_modules/.bin/vitest run --config vitest.integration.config.ts test/e2e/flashcard-study.e2e.spec.ts
   Test Files  1 passed (1)
        Tests  14 passed (14)
  ```
- tedris-web: unit specs for the model, study session, public view and home sections;
  Playwright `learn.e2e.ts` against the running app and API with a real session, and
  the existing `decks.e2e.ts` re-run:

  ```
  $ grep -cE '^\s*test\(' apps/tedris/e2e/learn.e2e.ts apps/tedris/e2e/decks.e2e.ts
  apps/tedris/e2e/learn.e2e.ts:16
  apps/tedris/e2e/decks.e2e.ts:26
  ```

  The Playwright runs were not repeated for this record (they need the running app,
  the API and a minted session), and no log of the earlier runs was kept. What the
  author saw then: `decks.e2e.ts` passed 25 of its 26 cases on the first run, and the
  one that failed passed when run alone (flaky).
- Biome ratchet (`tools/ci/biome-baseline.json`, 71 to 70 warnings, infos stay 22).
  `biome ci . --reporter=json` on the parent of the package commit (`git archive
  254c36c3^`) and on this head, summaries:

  ```
  parent of 254c36c3: errors 0, warnings 71, infos 22
  this head:          errors 0, warnings 70, infos 22
  ```

  Comparing the two diagnostics lists, the one warning that went is
  `lint/correctness/noUnusedImports` in `apps/tedris/app/[locale]/decks/study/page.tsx`,
  a file this package deleted. Nothing was added.
- Phone width (390) was looked at for Ana sayfa and Çalışma.

## What was not verified

- Sign-in through Keycloak's form on this machine: the shared `tedris-dev` client
  has no redirect URI for port 4200, so the specs ran with a session minted from a
  direct grant (`E2E_SESSION_COOKIES`, see `e2e/sign-in.ts`). Without the variable
  the form is used as before.
- "API is down" for a home section was covered by a unit spec with the read
  replaced, not by stopping the shared API.
- Whether the interval table is what the product wants (see above).
- The top bar of the designs is still not drawn (shell migration is not planned;
  see the earlier packages): the legacy header shows.
