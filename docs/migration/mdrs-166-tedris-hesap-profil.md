# MDRS-166 — tedris account, public profile and köşk application

Designs tedris/34 (Hesap), tedris/35 (Herkese açık profil) and tedris/37
(Köşk açma başvurusu).

## What was done

- **tedrisat** (migration `0038_profile_and_kosk_application`, renumbered on
  top of stack-35's `0037_flashcard_review_schedule`; `0035` stays reserved
  for another package; rollback in `database/rollbacks/`): two tables.
  - `user_profiles` (key = Keycloak `sub`, not a foreign key): the names a
    person typed, `kunye` (unique, case-insensitive, nullable), `gender`
    (FEMALE/MALE), `city`, `about` and four `show_*` switches, all off.
    `users` keeps what the token says and is overwritten from it on every
    sync, so a typed name has to live apart; `GET /me` returns the typed name
    when there is one. Nothing is written to Keycloak.
  - `kosk_applications`: `applicant_id`, name, field (11 codes), summary,
    reason, e-mail, optional phone, `status` (PENDING on creation).
- Endpoints: `PATCH /me` now also takes `givenName` / `familyName` (both
  required non-blank when sent; the settings in `users` and the names in
  `user_profiles` are written in one transaction, so a failed name write leaves
  the time zone and language as they were); `GET` and `PATCH /me/public-profile`;
  `GET /users/:id/public-profile` (any signed-in caller; only the künye, the
  gender and the fields whose switch is on; 404 until a künye exists; 409
  `KUNYE_TAKEN` on a clash); `POST /kosk-applications` (any signed-in caller,
  201 `{id, status: "PENDING"}`). "Derslerin" is the caller's ENROLLED and
  COMPLETED published courses, minus any course they are barred from.
- **tedris-web**: `/account` gains the personal-information, time-zone and
  language, calendar and sign-out cards (the roles section of tedris/43 stays
  below them) and a card that leads to `/account/public-profile`; the public
  profile page with its live "Başkaları böyle görür" preview; and
  `/kosk-applications/new`, the address Keşfet's "Köşk açma başvurusu" button
  already pointed to. Choosing a time zone saves at once and refreshes the
  viewer's zone cookie, so the dates rendered with the viewer's zone (the home
  page's next session, measured 20:00 in Istanbul, 13:00 in New York) change
  zone without a reload. Programım does **not**: it stays on Istanbul time and
  says "Saatler İstanbul saatiyle" (the stack-33 decision), measured 20:00
  before and after the change.
- **i18n**: one new namespace `tedrisAccount` (tr, en, ar), loaded by
  `lib/i18n/request.ts` and **not** registered in `next-i18n.d.ts`: the
  `tedris` catalogue is at the edge of TS2589 (see MDRS-164) and the typed keys
  of this one broke `t(...)` calls in unrelated files (observed while writing,
  not re-run). The catalogue holds 145 keys per language:
  `jq '[paths(scalars)]|length' libs/i18n/src/locales/{tr,en,ar}/tedris-account.json`
  prints `145` three times. The texts are read through
  `lib/i18n/loose.ts`; `test/account-messages-parity.spec.ts` pins what the
  types would have caught. `kosk-card.tsx`'s `t` is typed by what it calls for
  the same reason.
- `libs/services` client and `swagger-docs/tedrisat.json` regenerated;
  `api-factory.ts` exports the new types and `koskApplications`.
- `apps/tedris/e2e/sign-in.ts` (new): the Keycloak client does not list
  `localhost:4300` as a callback, so with `E2E_NEXTAUTH_SECRET`,
  `E2E_KEYCLOAK_ISSUER` and `E2E_KEYCLOAK_CLIENT_SECRET` set and a port other
  than 4000 it takes tokens from the direct grant and writes the session
  cookie NextAuth would have; otherwise it signs in through the real form.

## What was verified

Figures measured by the author before stack-35 was merged in (the gate, the
browser run) are kept as they were and marked; every figure that a cheap command
can give at the head `d93e78d` was re-counted and carries its command.

- Gate in the worktree, all `--skip-nx-cache`: typecheck 19 tasks, test 13
  (tedrisat 1078 tests, tedris-web 401, per the JUnit files), build 15, lint
  17, module-boundaries 17. These are the author's figures from before the
  merge of stack-35 and were **not re-run** (slow Nx runs). The CI `Verify` job
  passed on the head: `gh pr checks 157` lists `Verify pass 7m45s` for
  `d93e78d`.
- Re-counted at the head, after the merges, and different from the gate's
  earlier numbers:
  - `jq '.paths|length' libs/services/swagger-docs/tedrisat.json` prints `119`,
    and `node tools/ci/assert-openapi-spec-fresh.mjs` prints
    `openapi spec freshness: 119 paths, identical to what the exporter writes
    today` (the PR's own head before the stack-35 merges, `8c48ec04`, had 86:
    `git show 8c48ec04:libs/services/swagger-docs/tedrisat.json | jq '.paths|length'`).
  - `node tools/ci/biome-ratchet.mjs` prints `errors 0 (baseline 0)`,
    `warnings 70 (baseline 70)`, `infos 22 (baseline 22)` (at `8c48ec04` the
    baseline file read `[0,71,22]`; the merged-in baseline is 70/22).
  - `cd apps/tedris && ./node_modules/.bin/vitest list | wc -l` prints `441`
    tests in tedris-web, 440 before the switch test added in the review round
    (the gate had 401). The tedrisat unit count was not re-listed: starting its
    Testcontainers config for `vitest list` ran past four minutes.
- Backend e2e (`profile.e2e.spec.ts`, real AuthGuard on minted tokens): typed
  names survive the next token, blank names refused, a failed name write leaves
  the settings alone, the public profile shows only künye and gender until a
  switch is on and again hides the field when it is turned off, "Derslerin"
  lists published courses only, künye empty/duplicate (any case) refused, gender
  and switch names validated, 404 without a künye, 401 without a token; the
  application stores PENDING with and without a phone, refuses every missing
  field, a bad e-mail, a bad phone and an unknown field, and accepts all eleven
  fields. Re-run at the head with the review fix:
  `cd apps/tedrisat && ./node_modules/.bin/vitest run --config
  ./vitest.integration.config.ts test/e2e/profile.e2e.spec.ts` prints
  `Tests 15 passed (15)` (14 cases before the review round added the rollback
  case), and the same command on `test/e2e/user.e2e.spec.ts` prints
  `Tests 21 passed (21)`.
- Browser (`apps/tedris/e2e/profile.e2e.ts`, signed in as `e2e-talebe`, second
  account `e2e-muderris` for the public-profile call): every acceptance
  criterion of 34, 35 and 37 that a talebe can reach, the author's run of 5 of
  5, **not re-run** for this round (it needs Keycloak, the API and Postgres up
  together). `grep -c '^test(' apps/tedris/e2e/profile.e2e.ts` prints `5`, so
  the file still holds the five tests the run counted. Criterion 34/5 was
  driven through the sign-out confirmation to a signed-out state.
- The three screens were compared by eye with `ekran.png` at 1440 px; a person's
  look, not a command, so there is no output to cite.

## What was not verified

- The wording of validation errors, the success state of the application and
  the "Başvuru alındı" text: the canvas has none, so they are short plain
  Turkish, not designed copy.
- The real name of the explicit-consent text: the canvas shows the placeholder
  `[Açık rıza metninin adı]` and so does the page, as plain text with no link.
- Phone layout (390 px), dark theme, Arabic (rtl) UI, and the English/Arabic
  wording (written, not read by a speaker).
- "Diğer…" opens the runtime's full IANA list in a second select; the canvas
  does not draw it. After the sign-out confirmation Keycloak's end-session page
  may refuse the post-logout address on a non-4000 port; the session is gone
  either way.
- No review of an application exists (status stays PENDING), and nothing
  limits how many a person files beyond the global throttler.
- The names a person types do not yet reach the places that show a name to
  others (course rosters read `users`), only `GET /me` and the public profile.

## Merge notes

- Migration `0038` follows stack-35's `0037`; the earlier `0034` copy was
  regenerated with drizzle-kit (same SQL, new prevId) when stack-35 was merged.
  The SQL is the same: `diff <(git show
  2b7896a7:apps/tedrisat/src/database/migrations/0034_profile_and_kosk_application.sql)
  apps/tedrisat/src/database/migrations/0038_profile_and_kosk_application.sql`
  prints nothing, and `sha256sum` of both starts `b568898c6794`. The snapshot
  differs from the old `0034_snapshot.json` by `id`, `prevId` and what the
  merged-in migrations changed (`flashcard_progress.due_at`,
  `madrasahs.archived_at`, and others), not by anything of this package:
  `diff <(git show 2b7896a7:apps/tedrisat/src/database/migrations/meta/0034_snapshot.json
  | jq -S 'del(.id,.prevId)') <(jq -S 'del(.id,.prevId)'
  apps/tedrisat/src/database/migrations/meta/0038_snapshot.json)` lists only
  added columns, indexes and widened check constraints of other tables.
  Renumber the journal entry, file and snapshot again if the order differs.
- stack-35 also moved its texts into a separate namespace (`tedrisLearn`);
  both lists go into `request.ts`. If it registers its namespace in
  `next-i18n.d.ts`, mine intentionally is not there.
