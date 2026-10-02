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
  caller has no enrollment in.
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
  keys; 17 stale keys of the old study screen and `HomePage` were removed).
- Client regenerated (`pnpm openapi:tedrisat`).

## What was verified

- tedrisat: new unit specs (schedule, due-today, rating in `replaceManyProgress`) and
  `flashcard-study.e2e.spec.ts` (14 cases, real Postgres and guard).
- tedris-web: unit specs for the model, study session, public view and home sections;
  Playwright `learn.e2e.ts` (16 cases) against the running app and API with a real
  session; the existing `decks.e2e.ts` was re-run (25 of 26 on the first run; the
  one that failed passed alone: flaky).
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
