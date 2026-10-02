# MDRS-169 — the assignment foundation

Screens: nizam/04 "Bu işler Nazır'da", nizam/06 "Bu bölüm için izniniz yok",
tedris/43 "Hesap — görevi olan kullanıcı" (the roles section only). Base:
`release/stack-27-medrese-temeli`.

## What was done

**tedrisat**

- Role assignments already existed (MDRS-133/134, `role_assignments`). What was
  missing was the permission side, so migration `0027_permission_groups_grants`
  adds `permission_groups`, `permission_group_items` and `permission_grants`
  (a grant is one catalog code or one group, in one scope, held while not
  revoked and not expired). Nothing writes to them yet: the flows that create
  groups and grants belong to later packages; the read side is here.
- `src/assignment/permission-catalog.ts` is the permission catalog (27 codes)
  with the default set of two roles, taken from the sentences on tedris 43:
  KOSK_NAZIM (8 codes) and MUDERRIS (19). The other four roles hold nothing by
  default; they get what they are granted.
- New routes, all for the signed-in caller's own rows, no `AuthzGuard`:
  `GET /me/assignments`, `/me/roles`, `/me/grants`, `/me/permissions`,
  `/me/effective-permissions`, and `GET /nizam/chief-nazim`.
  A role whose köşk, medrese or course no longer exists is left out of all
  of them (`scope_id` is no foreign key).
- `GET /users/lookup?email=` searches the realm through Keycloak's Admin API as
  a service account (`src/keycloak-admin/`), exact match only, for SYSTEM_ADMIN
  and anyone who holds a role; every search writes an `audit_log` row
  (`user.lookup`). It answers 503 when the service account is not configured.
  `GET /users?email=` (the `users` table lookup) is unchanged.
- `GET /nizam/chief-nazim` returns `{ displayName }` of the first holder of the
  `SYSTEM_ADMIN` realm role, cached five minutes; `null` when nobody holds it,
  the directory is not configured or does not answer.
- Config: `TEDRISAT__KEYCLOAK_ADMIN_CLIENT_ID` / `_SECRET` (both or neither;
  `.env.example`, `docker-compose.yml`), the realm taken from `KEYCLOAK_ISSUER`.
- `libs/services` was regenerated (`pnpm openapi:tedrisat`).

**tedris-web** — `/account` (new page, in the header menu): "Görevlerin ve
izinlerin" with the roles table (role, imam, scope with Yayında/Taslak/Gizli,
grantor or "Kendin", date, term, "Nizam'da aç"/"Nazır'da aç" in a new tab) and
"Etkin izinlerin" (sentences per role, from the caller's real permissions only).
Absent when the caller holds no role. tr/en/ar messages. `NIZAM_URL`,
`NAZIR_URL` (`TEDRIS__*` in the root `.env`) are the button targets.

**nizam-web** — `/nazir-yonlendirme` and the home redirect for people whose
roles are only the medrese's and the course's; `NoAccess` as
`[locale]/not-found.tsx` plus a `[locale]/[...rest]` catch-all so that unknown
paths reach it; `NIZAM__NAZIR_URL`. Playwright e2e infrastructure for nizam
(`playwright.config.ts`, `e2e/`, `test:e2e`), the same shape as tedris-web's.

**Other** — `@medaris/ui/mds/button` is now `"use client"` (it renders event
handlers on its `<a>`; used from a server component it threw "Event handlers
cannot be passed to Client Component props", found in the browser).
`@medaris/tokens` added to nizam-web's dependencies (no new workspace package,
so no Dockerfile change). Nizam's shell `container` class became
`max-w-[80rem]` for the same reason as in tedris (stack-27): `medaris.css`
resets the breakpoint variables. `createTestApp` accepts provider overrides.

## What was verified

Gate in this worktree, all `--skip-nx-cache`: `typecheck`, `test`, `build`,
`lint`, `module-boundaries` green. `assert:openapi-fresh` and
`assert:env-compose-parity` green. tedrisat: 59 files, 863 tests, of which
`test/e2e/assignments.e2e.spec.ts` (17, real Postgres) and
`test/unit/assignment/` (19). tedris-web `test/account-page.spec.ts` (10),
nizam-web `test/nazir-redirect.spec.ts` (10).

Browser, real Keycloak sign-ins of the `e2e-*` accounts, local tedrisat and
Postgres: tedris `e2e/account.e2e.ts` 3/3 (müderris: three roles with badges,
"Kendin", "Süresiz", Nazır link and accessible name, no köşk permission;
köşk nazım: Nizam link opens a new tab with the köşk id; talebe: no section) and
nizam `e2e/assignments.e2e.ts` 5/5 (müderris is sent to the Nazır page and the
list matches the seeded roles; the Nazır link; köşk nazım is not sent; unknown
path and unknown / malformed köşk id show the "izniniz yok" screen with the
session e-mail). Both ran before the permission list was switched to column
flow (`md:columns-2`); that change was checked by typecheck and the render test,
not re-run in a browser.

## What was not verified

- `GET /users/lookup` and a named başnazım against a real Keycloak: the
  `tedrisat-admin` service-account client does not exist in the shared dev
  realm and its secret is a human task. Covered with a faked fetch in unit and
  e2e tests. Locally the route answers 503 and chief-nazim answers null.
  **To do by a person:** create a confidential client (e.g. `tedrisat-admin`)
  with "Service accounts roles" on, give its service account the
  `realm-management` roles `view-users` and `query-users`, set the two env
  keys. The `config/keycloak/` provisioning package was not extended: its
  validator refuses a client with only a service-account flow, and changing it
  is outside this package.
- SYSTEM_ADMIN-only behaviour (lookup as SYSTEM_ADMIN, the named başnazım on
  nizam/06): the realm role does not exist in the shared Keycloak, so the
  `e2e-sistem-admin` account cannot exercise it. Covered by the API e2e with a
  SYSTEM_ADMIN token and a faked directory.
- nizam/06 criterion 1 asks that "403 durum kodu/sayfa başlığı korunur": the
  screen is Next's `not-found`, so the status is 404 for both a missing record
  and a section the account may not open (the same answer on purpose).
  A real 403 from an API call is turned into this screen by the pages that
  call `notFound()`; no page was changed to do so beyond the existing köşk page.
- nizam/04 criterion 5 ("Görevi olmayan kullanıcı 03'ü görür"): screen 03 is
  not in this package; such a person stays on the home page.
- tedris/43 criterion 5 ("Ekran 34 işlevleri aynen çalışır"): screen 34 (personal
  information, time zone, calendar, sign-out) is package 36; `/account` here
  carries only the roles section.
- The Nazır course link `<NAZIR_URL>/courses/<id>` is the guessed route name;
  Nazır has no such page yet. The Nizam link `<NIZAM_URL>/kosks/<id>` is a real
  route.
- The shells around the new screens are still the old ones (tedris and nizam
  app bars / sidebars); the unified-design shell is a later package.
- Migration number: the shared local database already held stack-28's
  `0027_session_cancellation`; this branch's `0027_permission_groups_grants`
  has a later timestamp, so drizzle applied it. When both branches meet, the two
  `0027` files and the journal need a rename.
