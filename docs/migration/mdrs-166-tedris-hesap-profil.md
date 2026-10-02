# MDRS-166 — tedris account, public profile and köşk application

Designs tedris/34 (Hesap), tedris/35 (Herkese açık profil) and tedris/37
(Köşk açma başvurusu).

## What was done

- **tedrisat** (migration `0034_profile_and_kosk_application`, number chosen so
  it does not meet the parallel package's 0033; rollback in
  `database/rollbacks/`): two tables.
  - `user_profiles` (key = Keycloak `sub`, not a foreign key): the names a
    person typed, `kunye` (unique, case-insensitive, nullable), `gender`
    (FEMALE/MALE), `city`, `about` and four `show_*` switches, all off.
    `users` keeps what the token says and is overwritten from it on every
    sync, so a typed name has to live apart; `GET /me` returns the typed name
    when there is one. Nothing is written to Keycloak.
  - `kosk_applications`: `applicant_id`, name, field (11 codes), summary,
    reason, e-mail, optional phone, `status` (PENDING on creation).
- Endpoints: `PATCH /me` now also takes `givenName` / `familyName` (both
  required non-blank when sent); `GET` and `PATCH /me/public-profile`;
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
  `tedris` catalogue is at the edge of TS2589 (see MDRS-164) and 150 more typed
  keys broke `t(...)` calls in unrelated files. The texts are read through
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

- Gate in the worktree, all `--skip-nx-cache`: typecheck 19 tasks, test 13
  (tedrisat 1078 tests, tedris-web 401, per the JUnit files), build 15, lint
  17, module-boundaries 17; `biome-ratchet` 71/22 against baseline 71/22;
  `assert-openapi-spec-fresh` 86 paths identical.
- Backend e2e (`profile.e2e.spec.ts`, 14 cases, real AuthGuard on minted
  tokens): typed names survive the next token, blank names refused, the public
  profile shows only künye and gender until a switch is on and again hides the
  field when it is turned off, "Derslerin" lists published courses only, künye
  empty/duplicate (any case) refused, gender and switch names validated, 404
  without a künye, 401 without a token; the application stores PENDING with and
  without a phone, refuses every missing field, a bad e-mail, a bad phone and an
  unknown field, and accepts all eleven fields.
- Browser (`apps/tedris/e2e/profile.e2e.ts`, 5 of 5, real API, Postgres and
  Keycloak, signed in as `e2e-talebe`, second account `e2e-muderris` for the
  public-profile call): every acceptance criterion of 34, 35 and 37 that a
  talebe can reach. Criterion 34/5 was driven through the sign-out confirmation
  to a signed-out state.
- The three screens were compared by eye with `ekran.png` at 1440 px.

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

- Migration `0034` assumes the parallel package took `0033`; renumber the
  journal entry, file and snapshot if the order differs.
- stack-35 also moved its texts into a separate namespace (`tedrisLearn`);
  both lists go into `request.ts`. If it registers its namespace in
  `next-i18n.d.ts`, mine intentionally is not there.
