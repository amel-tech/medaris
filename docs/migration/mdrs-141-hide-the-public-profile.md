# MDRS-141 — hide the talebe's public profile

The owner's order of 4 Oct, in chat: "talebenin profil sayfası için çok erken şu
an, bunu gizle herkese". Decision d-1004-22 had already said "henüz değil".

This is a hide, not a delete. Every line of the profile stays in the tree, and
turning it back on is one environment value and one constant. It is **not** the
MDRS-141 build (a signed-out künye, a visitor page, audit rows, consent): the
owner said not now, and none of that is here.

## What is hidden

- **API** (tedrisat): `GET /me/public-profile`, `PATCH /me/public-profile` and
  `GET /users/:id/public-profile` answer `404 PUBLIC_PROFILE_UNAVAILABLE` for
  every signed-in caller, the başnazım included, while
  `API__PUBLIC_PROFILE_ENABLED` is anything but `true` (default `false`).
  - One error code and one body for all three routes and for every person: the
    answer does not say whether someone has a profile.
  - It is a guard, `PublicProfileEnabledGuard`, listed after `AuthGuard` on
    `ProfileController`. Guards run before pipes and interceptors, so the 404
    comes before the id and body are validated (a malformed id or body is a 404,
    not a 400), before the user-sync interceptor writes a `users` row for the
    caller, and before the service reads or writes `user_profiles`. Listed after
    `AuthGuard`, so a request with no token or a bad one is still a 401.
- **tedris-web**: the card "Herkese açık profil" is gone from Hesap
  (`/account`), with its link, and `/account/public-profile` answers
  `notFound()` before it reads the profile. Both read one constant,
  `PUBLIC_PROFILE_ENABLED` in
  `apps/tedris/features/public-profile/availability.ts`.

## What is kept

- The editor (`features/public-profile/**`), its actions, `readPublic`, the
  `user_profiles` table and its data, the DTOs, and every locale key in tr/en/ar
  (the parity specs are unchanged and green). Nothing was deleted, and no
  migration was added.
- Hesap's **personal card and the typed name are not part of this and stay**:
  `PATCH /me` with `givenName`/`familyName`, and the card that edits them. The
  owner should know that hiding the profile does not hide those.
- Rows already written to `user_profiles` stay in the database. A künye someone
  typed before this change is not shown to anyone while the profile is hidden,
  and is not deleted.

## How to turn it back on

Both, together (either alone leaves the profile unreachable):

1. API: set `API__PUBLIC_PROFILE_ENABLED=true` (`PUBLIC_PROFILE_ENABLED` inside
   the container; compose maps `TEDRISAT__PUBLIC_PROFILE_ENABLED` first, then the
   `API__` one).
2. tedris-web: change `PUBLIC_PROFILE_ENABLED` to `true` in
   `apps/tedris/features/public-profile/availability.ts` and deploy.

The Playwright spec "Herkese açık profil" in `apps/tedris/e2e/profile.e2e.ts` is
skipped unless `E2E_PUBLIC_PROFILE_ENABLED=true`; set that with the two switches.

The KVKK condition on MDRS-141 is unchanged by this: the association's legal
contact has not confirmed the wording for a künye that cannot be hidden, and a
signed-out reader does not exist yet (that is Phase 1 of the MDRS-141 dossier,
not built). Switching the profile on again exposes the künye and gender to every
signed-in caller exactly as MDRS-166 shipped it.

## Behaviour changes (for the PR)

- Hesap loses one card, "Herkese açık profil", and with it the only link to the
  editor.
- `/account/public-profile` answers 404.
- Three API routes answer `404 PUBLIC_PROFILE_UNAVAILABLE` for every signed-in
  caller: `GET /me/public-profile`, `PATCH /me/public-profile`,
  `GET /users/:id/public-profile`. Before, they answered 200 (or 400, 409, 404
  `PUBLIC_PROFILE_NOT_FOUND`). A caller with no token is a 401 as before.
- `GET /users/:id/public-profile` no longer tells apart a person with no künye
  (404 `PUBLIC_PROFILE_NOT_FOUND`) from one with a künye while hidden.
- Operations: a new optional environment key, `API__PUBLIC_PROFILE_ENABLED`
  (`.env.example`, `docker-compose.yml`, `docs/runbooks/deploy-tedrisat-api.md`).
  Unset means hidden: the app's own default is false (`config.spec.ts`), and
  the compose fallback and `.env.example` both ship `false`
  (`public-profile-shipped-default.spec.ts`), so a deployment that does nothing
  gets the hidden state.

## Decided by default, owner may overrule

- **Guard rather than a service line.** The brief allowed either; the guard also
  keeps the user-sync interceptor from writing a `users` row for a caller who
  only came to look, and keeps a bad id or body from answering 400.
- **The Hesap card is not deleted but gated by the constant**, so the component
  stays and the one-line flip works. `PublicProfileCard` is still in
  `account-settings.tsx`.
- **The Playwright spec is skipped, not deleted**, behind
  `E2E_PUBLIC_PROFILE_ENABLED`.
- The route-inventory snapshot of the MDRS-135 stack does not exist on this base
  (`origin/main`), so nothing was regenerated there. After the stack merges, the
  three routes keep their line as `no AuthzGuard` unless MDRS-44 changes it; the
  guard added here is not an authorization decision.

## Tests and red-then-green

Each "red" below was run by putting the source change back, reading the vitest
summary, and restoring it. Logs are under the wave scratch directory.

| Criterion | Test | Fails without the change |
| -- | -- | -- |
| Default: three routes answer 404 `PUBLIC_PROFILE_UNAVAILABLE` for a signed-in student and for the başnazım | `test/e2e/public-profile-hidden.e2e.spec.ts`, "for a signed-in student" and "for the başnazım", one case per route | Guard removed from the controller: 12 of 13 failed (all 404 cases, the same-body case, the pipes case, the writes case) |
| A person with a profile and one without answer the same | same file, "gives the same body ..." | Same run, failed |
| A malformed id or body is a 404, before the pipes | same file, "answers 404 before the pipes" | Same run, failed |
| No token or a bad token is 401, never 404 (guard order) | same file, "keeps a missing or bad token a 401" | Guard listed before `AuthGuard`: that one test failed, the other 12 passed |
| Nothing written: profile rows unchanged, no `users` row for the caller | same file, "writes nothing", with a caller (`LOOKER`) that no other case sends through the interceptor, because `UserSyncService` keeps a recent-sync cache that `cleanTables` does not clear | Guard removed: failed. Guard replaced by a `throw` as the first line of each handler (the interceptor then runs): the whole file ends 2 failed, 11 passed, "writes nothing" among the failures (`expected [ …(2) ] to deeply equal [ Array(1) ]`). With the earlier caller reused it stayed green in the full file and failed only alone |
| Existing cases keep running with the switch on, through the config | `test/e2e/profile.e2e.spec.ts` sets `PUBLIC_PROFILE_ENABLED=true` before booting | The line removed: 8 of 15 failed (the public-profile cases) |
| The switch is on only for exactly `true` | `test/unit/config.spec.ts`, "public profile switch" | Reading changed to `!== "false"`: 1 failed |
| The guard refuses false, unset and non-boolean values | `test/unit/user/public-profile-enabled.guard.spec.ts` | Covered by the e2e red above; not separately mutated |
| Shipped default is false in compose and `.env.example` | `test/unit/public-profile-shipped-default.spec.ts` (2 tests) reads both files | Compose default changed to `true`: failed; `.env.example` set to `true`: failed. In the same state `assert-env-compose-parity.mjs` still passed, which is why the gate does not cover this |
| Env key reaches the container | `node tools/ci/assert-env-compose-parity.mjs` | Compose line deleted: the gate failed naming `API__PUBLIC_PROFILE_ENABLED` |
| The page 404s while the constant is false, without reading | `apps/tedris/test/public-profile-hidden.spec.ts`, "answers /account/public-profile with a 404 ..." | Constant set to `true`: failed. Gate line deleted from the page: failed |
| Hesap has no link to `/account/public-profile` | same spec, "leaves the card and its link out of Hesap"; `test/account-profile.spec.ts` (line formerly expecting the link) | Constant `true`: failed. Gate removed from the card: failed |
| Turning it on is the one constant | same spec, "turning the public profile back on ..." (two cases) | Passing cases for the other direction |
| Locale parity | `test/account-messages-parity.spec.ts` (unchanged) | Green, keys untouched |

## What was verified

See the PR description for commands and counts, read off the runs.

## What was not verified

- The Playwright specs need a running stack with Keycloak and are not run.
- No browser was used: the 404 page and the missing card are proved by the
  rendered component and the page function under the test runner, not in Next.
- The route-inventory and authz specs of the MDRS-135 stack: not on this base.
- Two specs of tedris-web (`auth-entry.spec.ts`, `expired-session.spec.ts`) fail
  on this base without my change (`localStorage` is undefined in the test
  environment, 12 tests); I did not look into why.
