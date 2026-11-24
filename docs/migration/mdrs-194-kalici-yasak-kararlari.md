# MDRS-194 — Permanent ban requests are decided into a platform ban

A medrese could ask for a ban to be made permanent since MDRS-187 (`POST /bans/:banId/permanent-request`),
and nothing answered the request: Nizam's menu pointed at `/talepler/kalici-yasak`, which did not exist,
and the home page always said that no request was waiting. This builds the decision: the backend, the
Nizam page (design nizam/45), and the outcome where the requester sees it (Nazır's Yasaklamalar).

Every number below sits next to the command that printed it; commands run from the repository root.

## What was built

### tedrisat

- `ban_scope` gains `PLATFORM`. The checks that read bans (`ban.repository.ts`,
  `database/enrolled-courses.ts`, and the session invitations' `SEAT_OPEN` in
  `lesson-invitation/lesson-invitation.repository.ts`) refuse a person with an open platform ban in every
  köşk, medrese and course. The invitation predicate has no test of its own for the platform scope.
- `ban_permanent_requests` gains `status` (`PENDING`, `APPROVED`, `REJECTED`), `decided_by`,
  `decided_at`, `decision_note` and `platform_ban_id`. A request that existed before reads as `PENDING`.
- Migration `0082_permanent_ban_decisions` and its rollback
  `rollbacks/0082_permanent_ban_decisions.down.sql`.
- Three routes, tagged `nizam`:

  | Route | operationId |
  | --- | --- |
  | `GET /permanent-ban-requests?status=PENDING\|DECIDED` | `listPermanentBanRequests` |
  | `POST /permanent-ban-requests/:id/approve` | `approvePermanentBanRequest` |
  | `POST /permanent-ban-requests/:id/reject` (`{ note }`, required) | `rejectPermanentBanRequest` |

  They are for the başnazım and for a Medaris nazımı holding `platform.ban_account`; everyone else is
  `403 BAN_FORBIDDEN`. Like the other ban routes they carry no `@Authz` decorator and are decided in the
  service (`BanAuthority`), which is why the route inventory lists them as `no AuthzGuard`.
- Refusals: `PERMANENT_BAN_REQUEST_NOT_FOUND` (404), `PERMANENT_BAN_REQUEST_NOT_PENDING` (409),
  `BAN_ALREADY_LIFTED` (409: a request whose lower ban was lifted can only be refused),
  `BAN_TARGET_INVALID` (400: the decider themself, or anyone who holds an assigned role in any scope: a
  nazım, a başmüderris, a nazır, a müderris. The lower bans refuse whoever runs the scope they cover;
  a platform ban covers every scope. The roles are taken back first. The başnazım is a realm role and
  cannot be told from `role_assignments`).
- An approval reads the lower ban again under a row lock inside its transaction, so a ban lifted in the
  moment between the check and the decision is still a `BAN_ALREADY_LIFTED`.
- Audit rows: `permanent_ban.approve` and `permanent_ban.reject`, plus `ban.create` for the platform ban.
- `MadrasahBanResponse` gains `permanentRequestStatus`, `permanentDecidedAt` and
  `permanentDecisionNote`; the Nizam dashboard's `pendingTotals.permanentBanRequests` is the real number
  of waiting requests.

### The generated client

`libs/services/src/tedrisat/generated` and `libs/services/swagger-docs/tedrisat.json` were regenerated
with `pnpm openapi:tedrisat`. The generator stamps `info.version` from `apps/tedrisat/package.json` into
the header of every file; those version-only lines were put back to the committed `0.2.0`, as earlier
regenerations left them, so the commit holds the contract change alone
(`tools/ci/assert-openapi-spec-fresh.mjs` excludes `info.version` for the same reason).

### nizam-web

- `/talepler/kalici-yasak` (`app/talepler/kalici-yasak/{page,loading}.tsx`,
  `features/permanent-bans/`): two tabs with their counts ("Karar bekleyen", "Karara bağlanan") and one
  card per request: the person, "Mevcut yasak" (Kapsam, Koyan, Yasağın gerekçesi), "Talep" (Talep eden,
  Talebin gerekçesi), and "Yasaklamalar'da gör", "Reddet", "Onayla". "Reddet" opens the shared
  `RejectDialog` (new kind `permanentBan`) and needs a reason. A request whose lower ban was lifted says
  so and offers only "Reddet". Empty, loading, failed read and 403 behave as on İtirazlar.
- Yasaklamalar (`/yasaklamalar`): a platform ban reads "Platform · Bütün Medaris", a medrese ban
  "Medrese · <medrese>" (it used to fall through to "Köşk" with no name); the scope chips gain
  "Platform"; the page takes `?q=`, which is where "Yasaklamalar'da gör" sends the person's e-mail.
- Home page: the "Kalıcı yasak talepleri" section shows the number of waiting requests and a link to the
  page when there is one. A Medaris nazımı always sees the section; the başnazım, whose home page
  (nizam/01) does not draw it, sees it only while a request waits, so that the total in the greeting has
  somewhere to go.

### nazar-web

Yasaklamalar: beside "Kalıcı yasak talebi bekliyor", a decided request now reads "Kalıcı yasak talebi
onaylandı" or "Kalıcı yasak talebi reddedildi", the latter with the note of the refusal.

### i18n

`nizam.PermanentBansPage`, `nizam.DeckReject.permanentBan`, `nizam.BansPage.scope.{MADRASAH,PLATFORM}`,
`nizam.BansPage.platformDetail`, `nizam.Dashboard.permanentBans.pending` and
`nazar.Bans.permanentOutcome`, in tr, en and ar together.

## Departures from the design

- **Approving does not close the account.** The canvas says "Onay, kişiyi platformdan yasaklar ve
  hesabını kapatır". Closing a sign-in account needs an identity-provider (Keycloak admin) client this
  service does not have; that is MDRS-197 and was left out on purpose. The page therefore says what
  really happens: "Onay, kişiyi platformdan yasaklar: bütün köşk, medrese ve derslere erişimi kalkar."
  A person with a platform ban can still sign in; every köşk, medrese and course refuses them.
- **The counters are the tabs.** The canvas draws "Karar bekleyen 2" and "Karara bağlanan 1" as two
  numbers; here they are the two tabs with their counts, so that the decided requests can be read too.
- **The route.** The spec suggested `/permanent-ban-requests`; the menu has always pointed at
  `/talepler/kalici-yasak`, so the page lives there.
- **nizam/49 ("Platformdan yasakla") is not built.** A platform ban is opened only by approving a
  request.

## Review findings

`/code-review` over `origin/main...HEAD` returned ten findings; `/security-review` returned none.

Fixed: session invitations still went to a platform-barred talebe; the home page's newest-bans card
read a platform ban as "Köşk yasağı:" with no name (and `DashboardBanResponse.scope` still declared two
scopes); a course roster badged a platform ban "Yasaklı · Bu ders" and offered a lift the course team
cannot perform; the "Karara bağlanan" tab could go blank after a decision returned on it; an approval
could land on someone who runs a scope; an approval could race a lift; two API descriptions still said
that platform bans do not exist.

Left as they are, on purpose:

- **A tab lists at most 100 requests** (`LIST_LIMIT`), with the full counts on the tabs. No paging was
  built: the waiting list is worked off, and a hundred decided requests is far off.
- **"Yasaklamalar'da gör" searches by the e-mail or name the card shows.** `GET /bans?q=` matches the
  `users` table only, so a person who has a seat but never signed in is not found by it.
- **A Medaris nazımı holding only `platform.ban_scoped`** sees "Bu yasağı yalnız Medaris yönetimi
  kaldırabilir." on a platform ban, although the missing piece is `platform.ban_account`.
- **The Dersler table's banned count** (`kosk-admin.repository.ts`) counts course and köşk bans, not a
  platform ban.

## Known gap, not part of this work

The başnazım's menu holds "YouTube bağlantısı" (`/ayarlar/youtube`), which has no page. The new check in
`apps/nizam/test/shell-nav.spec.ts` (every başnazım and Medaris nazımı menu entry has a `page.tsx`)
lists it as the one known exception, so a second missing page fails, and so does building this one
without taking it off the list.

## Verified

| What | Command | Result |
| --- | --- | --- |
| The rollback, on a real Postgres | `pnpm --filter ./apps/tedrisat exec vitest run test/e2e/permanent-ban-migration.e2e.spec.ts` | `Tests  1 passed (1)`: 0082 keeps existing bans and requests, the rollback restores 0080's enum, columns, checks and indexes, removes the platform ban, keeps the lower bans and the request, and 0081 applies again |
| The routes | `test/e2e/permanent-ban.e2e.spec.ts` in the tedrisat run | `tests="9" failures="0"` in `apps/tedrisat/coverage/junit.xml` |
| The dashboard's number | `test/e2e/nizam-dashboard.e2e.spec.ts` in the tedrisat run | `tests="11" failures="0"` |
| The Nizam page and its rules | `pnpm --filter ./apps/nizam exec vitest run test/permanent-bans.spec.tsx` | 12 tests, all passed |
| OpenAPI freshness | `pnpm assert:openapi-fresh` | `260 paths, identical to what the exporter writes today` |
| typecheck | `pnpm nx run-many -t typecheck --skip-nx-cache` | `20 tasks: 20 succeeded` |
| build | `pnpm nx run-many -t build --skip-nx-cache` | `16 tasks: 16 succeeded` |
| lint | `pnpm nx run-many -t lint --skip-nx-cache` | `18 tasks: 18 succeeded` |
| module-boundaries | `pnpm nx run-many -t module-boundaries --skip-nx-cache` | `18 tasks: 18 succeeded` |
| nizam-web, nazar-web, tedris-web tests | `pnpm nx run-many -t test --skip-nx-cache`, read from each `coverage/junit.xml` | nizam `tests="984" failures="0"`, nazar `tests="1896" failures="0"`, tedris `tests="1360" failures="0"` |
| tedrisat tests | `pnpm nx run tedrisat:test --skip-nx-cache` | `tests="3934" failures="5"` in the last full run: the four Keycloak container suites, see below, and one ordering assertion in `permission-admin.e2e.spec.ts` that passed when the file was run alone (`Tests  25 passed (25)`) |

Two tests of the backend commit's own making were red and are fixed here: the route inventory snapshot
(`test/e2e/__snapshots__/authz-route-inventory.txt`) did not hold the three routes, and
`test/e2e/ban.e2e.spec.ts` still expected `GET /bans?scope=PLATFORM` to be a 400.

## Not verified

- **Nothing was tried by hand in a browser.** The dev environment only carries this after a merge.
- **The approval against a real Keycloak**: not applicable, no account is closed.
- **Arabic and English wording** was written with the neighbouring pages' vocabulary and not reviewed
  by a speaker.

## The test gate on the machine this was written on

`pnpm nx run-many -t test` did not come back fully green in one run there, for two reasons that are the
machine's and not the change's. Both were measured.

- **Random 404s and 403s without an error code, in different suites on every run** (12, 7, 8, 10 and 6
  failures in five tedrisat runs, with 4, 3 and 1 workers alike). `createTestApp` returned an app that
  was not listening, so supertest bound it to port 0 on the wildcard address for every request and then
  called `127.0.0.1:<port>`. The machine held dozens of other processes listening on `127.0.0.1` at
  ephemeral ports (`lsof -nP -iTCP -sTCP:LISTEN`); when the ports met, the more specific listener took
  the request. **Fixed here**: `apps/tedrisat/test/helpers/test-app.helper.ts` now listens on
  `127.0.0.1` itself. The next run had none of them: `tests="3934" failures="4"`.
- **The suites that start a Keycloak container** (`keycloak-audience`, `keycloak-provision`,
  `keycloak-smtp`, `partner-enrollment-keycloak` in tedrisat, `email.e2e` in keycloak-theme) were green
  in the first full run of the day and red in the later ones (`email.e2e` was green again in the last): the admin token request is answered
  `403 {"error_description":"HTTPS required"}`. Reproduced by hand with the same image
  (`quay.io/keycloak/keycloak:26.3.2 start-dev`): published with `-P` (all interfaces, as Testcontainers
  does) the request from the host is refused, published with `-p 127.0.0.1::8080` it is answered 200. The
  container sees the host as an external address in the network state the machine was in. **Not fixed**:
  nothing in this change touches those suites, and CI is where they are decided.
