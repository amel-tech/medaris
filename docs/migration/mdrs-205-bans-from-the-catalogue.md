# MDRS-205 — Bans are decided from the permission catalogue

Stacked on MDRS-135 (`taha/mdrs-135-…`, tip `2ea15145`). The MDRS-135 note left the ban routes on the
roles held ("What is NOT done", "Open questions" 1) and the review called it H2: a Medaris nazımı, a ders
nazırı or a medrese nazırı with no grant could ban and lift, a Medaris nazımı with no grant listed every
ban with its reason, a başmüderris holding `ban.course` was refused by the course route, and a granted
`ban.*` code changed nothing. This moves every ban action onto the catalogue. Every number below sits
next to the command that printed it; commands run from the repository root unless a `cd` says otherwise.

## The owner's answers

1. **A başmüderris MAY ban in its medrese's courses.** "The catalogue is right, the route is wrong."
2. **The permission to ban at a level also lifts bans at that level.** `ban.course`, `ban.manage_kosk`,
   `madrasah.ban` and `platform.ban_scoped` both impose and lift. The kademe only orders WHO may lift
   WHOM: the level that placed the ban or any level above it, and a reason always required, as today.
3. **A Medaris nazımı holding only `platform.ban_scoped` may NOT impose or lift a course ban**; the
   başnazım (SYSTEM_ADMIN) can. His words: "Başnazım zaten atabilir ban ama medaris nazımı atamaz." A
   course ban belongs to the course-level authorities and those above them.

## What decides what

`apps/tedrisat/src/ban/ban-codes.ts` is the table. `BanAuthority` (`ban-authority.ts`) answers it: it
reads what the caller holds once (`TedrisatAuthzContext.holdings`, two statements, no scope filter), builds
the chain of the place the ban sits in (a course with its köşk and, for a medrese course, its medrese; a
köşk; a medrese; the platform), and asks the engine's own computation which of the caller's roles confer
one of the wanted codes there (`rolesConferring`, new in `libs/common`, which runs `effectivePermissions`
once per role, with the grants under it). A list of bans, each in its own course, is therefore decided in
memory from one read, not one decision per row.

| Action | Asked at | Takes (any one of) |
| --- | --- | --- |
| place a COURSE ban (`POST /courses/:id/bans`, `POST /madrasahs/:id/bans` scope COURSE) | the course | `ban.course`, `ban.manage_kosk` |
| place a KOSK ban, and widen a course ban to the köşk (`POST /bans/:id/extend`) | the köşk | `ban.manage_kosk`, `platform.ban_scoped` |
| place a MADRASAH ban (`POST /madrasahs/:id/bans`), and widen a course ban to the medrese (`POST /bans/:id/escalate`) | the medrese | `madrasah.ban`, `platform.ban_scoped` |
| lift a ban (`POST /bans/:id/lift`), by the ban's scope | the course / köşk / medrese | the same as placing it, and `ban.lift_course` for a course ban |
| ask for a permanent ban (`POST /bans/:id/permanent-request`) | the medrese | `madrasah.permanent_ban_request` |
| read a köşk's bans (`GET /kosks/:id/bans`) | the köşk | `ban.manage_kosk`, `platform.ban_scoped`, `platform.ban_account` |
| read every ban (`GET /bans`) | the platform | `platform.ban_scoped`, `platform.ban_account` |
| the medrese's own routes (`GET`, `POST /madrasahs/:id/bans`) | the medrese | their `@Authz` is unchanged: `madrasah.ban` or `platform.ban_scoped`; a course ban from there then takes the course row |

The başnazım, a realm role, bypasses the table as everywhere else. **The kademe** (`ban-tier.ts`, `BAN_TIERS`:
course 1 < medrese 2 < köşk 3 < platform 4) orders only: the standing a decision returns is the highest
role that confers the permission used, and that rank is what is recorded as `banned_tier` and what a lift is
compared against (`mayLift`). So a medrese nazırı with no grant who is also a müderris of one of its courses
is a müderris (tier 1) there; the nazırı role confers nothing and raises nothing.

What stays as roles: who cannot be barred (`RUNS_COURSE_ROLES`, `RUNS_MADRASAH_ROLES`, the people who run
the place, whatever they hold). The audit rows (`ban.create`, `ban.extend`, `ban.lift`,
`ban.permanent_request`, with the role in `details`) and the ban table are unchanged; there is no migration.
`MAY_BAN_ROLES`, `MAY_MODERATE_ROLES`, `MADRASAH_WIDE_ROLES`, `mayBanKosk`, `standingAmong` and the
repository's `rolesOf` and `holdsPlatformRole` are gone.

## Who gains and who loses, compared with main

Measured, not read: the new table of `test/e2e/ban-catalogue.e2e.spec.ts` was run against the ban code of
`2ea15145` (the tip this is stacked on), and the cases that flip are the changes. 
```
$ cd apps/tedrisat && git checkout 2ea15145 -- src/ban src/authz   # the pre-change ban code
$ ./node_modules/.bin/vitest run --config ./vitest.integration.config.ts test/e2e/ban-catalogue.e2e.spec.ts
 Test Files  1 failed (1)
      Tests  29 failed | 76 passed (105)
$ git checkout HEAD -- src/ban src/authz                          # put it back
```

The 29 are exactly the rows below: a Medaris nazımı with no grant, with only `platform.ban_scoped`, or with
only `platform.ban_account` placing a course ban, a köşk ban, widening to the köşk or the medrese, lifting
a course ban or a köşk ban, and reading the lists; a ders nazırı or a medrese nazırı with no grant placing,
lifting, widening or asking for a permanent ban; the başmüderris placing a course ban on the course route;
the grants of `ban.course`, `madrasah.ban` and `madrasah.permanent_ban_request` doing something; and the
medrese's own people being protected as targets on the course route.

| | Before (main) | Now |
| --- | --- | --- |
| **a başmüderris** bans in its medrese's courses on `POST /courses/:id/bans` | 403 `BAN_FORBIDDEN` (only the medrese route allowed it) | allowed: it holds `ban.course` there by role default. Its course route and its medrese route now agree |
| **a Medaris nazımı, no grant** places, widens and lifts bans, lists every ban and every köşk's bans | all of it, whatever it held | none of it |
| **a Medaris nazımı with `platform.ban_scoped`** | everything, including course bans | the köşk's and the medrese's level (place, widen, lift, read); **no course ban** to place or lift (the owner's third answer); no permanent-request (that is the medrese's code) |
| **a Medaris nazımı with `platform.ban_account`** | everything | reads the lists (it is the platform's own scope, not built: MDRS-197); acts on nothing |
| **a ders nazırı, no grant** | placed course bans | cannot; with `ban.course` it can (tier 1), with `ban.lift_course` it can lift only |
| **a medrese nazırı, no grant** | lifted, widened and asked for a permanent ban by ban id | cannot |
| **a medrese nazırı with `madrasah.ban`** | the same, and course bans through the medrese route | the medrese's level: a medrese-wide ban, widening a course ban to the medrese, lifting a medrese-wide ban. A **course** ban, to place or to lift, now needs `ban.course` or `ban.lift_course` as well (a course code given at the medrese reaches all its courses) |
| **a medrese nazırı with `madrasah.permanent_ban_request`** | had no effect | may ask Medaris administration for a permanent ban |
| `ban.manage_kosk`, `ban.course`, `ban.lift_course`, `madrasah.permanent_ban_request`, `platform.ban_account` | no reference outside the catalogue | asked (`ban-codes.ts`); 16 of the 21 unasked grantable codes of the MDRS-135 note are left |
| **the medrese's başmüderris and nazırı as the target** of a ban from `POST /courses/:id/bans` in a medrese's course | could be barred from the course route (only the medrese route protected them) | protected on both routes |
| the başnazım, a müderris, the köşk's nazımı, the başmüderris at the medrese's level | | unchanged (`ban-catalogue.e2e.spec.ts`, every row) |

A Medaris nazımı given `ban.course` for a course (a grant the catalogue allows, scope course) holds it
there and bans there at the platform's tier: the catalogue says so, and the owner's third answer is about
`platform.ban_scoped` alone.

Bans placed before this are untouched: a course ban a Medaris nazımı placed with no grant stays, tier 4,
and is lifted by the başnazım (or by a Medaris nazımı holding a course code on that course).

## Tests

```
$ cd apps/tedrisat && ./node_modules/.bin/vitest run --config ./vitest.integration.config.ts test/e2e/ban-catalogue.e2e.spec.ts
 Test Files  1 passed (1)
      Tests  105 passed (105)
```

`ban-catalogue.e2e.spec.ts` is the table, on the real routes and the real guard with minted tokens: every
action (place a course ban in a köşk's and in a medrese's course, a köşk ban, a medrese ban, widen to the
köşk and to the medrese, lift a course, a köşk and a medrese ban, ask for a permanent ban, read the köşk's,
the medrese's and the Medaris lists) against 12 actors (müderris, başmüderris, köşk nazımı, başnazım, ders
nazırı, medrese nazırı, Medaris nazımı with no grant, with `platform.ban_scoped`, with
`platform.ban_account`, another medrese's başmüderris, another köşk's nazımı, a stranger), with and without
the grant that changes the answer. It also pins the kademe (a müderris cannot lift what the başmüderris
placed, the köşk's nazımı can; a Medaris nazımı's köşk ban is the platform's alone), that the flags a list
gives (`viewerMayLift`, `viewerMayExtend`, `viewerMayEscalate`, `viewerMayRequestPermanent`) are what the
route then answers, who cannot be barred, and the audit rows.

```
$ cd apps/tedrisat && ./node_modules/.bin/vitest run test/unit/ban test/unit/authz/tedrisat-authz-context.spec.ts
   ban-authority.spec.ts (15)      the decision table, one actor per row, by place
   ban.service.spec.ts (30)        the service, with the standing the catalogue computes
   ban-madrasah.service.spec.ts (10)
   ban-tier.spec.ts (4)            ordering only
   tedrisat-authz-context.spec.ts (10), one of them the two statements of `holdings`
$ cd libs/common && ./node_modules/.bin/vitest run
 Test Files  11 passed (11)
      Tests  150 passed (150)       # six of them `rolesConferring` in effective-permissions.spec.ts
$ cd apps/tedrisat && ./node_modules/.bin/vitest run --config ./vitest.integration.config.ts test/e2e/ban.e2e.spec.ts test/e2e/madrasah-ban.e2e.spec.ts
 Test Files  2 passed (2)
      Tests  58 passed (58)          # the two existing ban specs, with the grants a nazır and a Medaris nazımı now need
```

Each of these fails with the old behaviour put back (`ban-catalogue.e2e.spec.ts`, `ban.e2e.spec.ts` and
`madrasah-ban.e2e.spec.ts`, 163 tests, run with one change to the source at a time and the change reverted):

| Change put back | Failing tests |
| --- | --- |
| the old role list in place of the catalogue (`MUDERRIS`, `DERS_NAZIR`, `KOSK_NAZIM`, `MEDARIS_NAZIM` stand for anything) | 80 of 163 |
| `platform.ban_scoped` also places a course ban | 2 |
| `platform.ban_scoped` also lifts a course ban | 3 |
| the standing is the highest role held, not the highest role that confers the permission | 1 (and the unit specs) |
| the kademe is not compared (`mayLift` always true) | 6 |
| a Medaris nazımı loses the köşk's and the medrese's level (`platform.ban_scoped` out of the köşk row) | 6 |
| `madrasah.ban` also lifts a course ban | 2 |

```
$ cd apps/tedrisat && ./node_modules/.bin/vitest run          # unit + e2e + the Keycloak-container specs, once, at e56d9794
 Test Files  136 passed (136)
      Tests  2101 passed (2101)
   Duration  753.07s
$ git diff 2ea15145 HEAD -- apps/tedrisat/test/e2e/__snapshots__ | wc -l
0
$ grep -rnE '\b(MAY_BAN_ROLES|MAY_MODERATE_ROLES|MADRASAH_WIDE_ROLES|mayBanKosk|standingAmong|holdsPlatformRole|rolesOf)\b' apps/tedrisat/src/ban apps/tedrisat/test/unit/ban apps/tedrisat/test/e2e | wc -l
0
$ tsc: libs/common (-p), libs/services, libs/ui, libs/i18n, libs/utils (-b), apps/tedrisat (--noEmit -p), apps/nizam, nazir, tedris (-b --force)
rc=0 for every one
$ pnpm run openapi:tedrisat && node tools/ci/assert-openapi-spec-fresh.mjs
✔ openapi spec freshness: 165 paths, identical to what the exporter writes today (info.version excluded by design).
```

The route inventory is unchanged on purpose (0 lines): no guard moved. The ban routes keep their guards
(`AuthGuard` alone on `BanController`, `AuthzGuard` with `madrasah.ban | platform.ban_scoped` on the medrese's
two) because what a by-ban-id route asks depends on the ban in hand; `BanService` decides each one through
`BanAuthority`, and `ban-codes.ts` is the one place that says what each asks. The `apps/nazir`, `apps/nizam`
and `apps/tedris` unit suites were not re-run: nothing in them depends on the API's behaviour, only on the
generated client, whose spec changed in route descriptions alone (18 lines, no route or schema).

## Not done, and what to look at

- **`ban.lift_course` is kept** as a way to lift a course ban without being able to place one. The owner's
  second answer lists four codes; with `ban.course` lifting too, `ban.lift_course` is redundant for anyone
  who holds `ban.course` (every role that has it by default does). Removing it would change the permission
  screens' counts (nazir/06, nizam/13) and strand grants of it, so it stays.
- **The sentences of `ban.course` and `madrasah.ban`** ("Talebeyi dersten yasakla (dersin yasak listesini
  görmeyi kapsar)", "Medrese düzeyinde yasakla; ders yasağını medreseye genişlet") are the canvases' and do
  not say they also lift, as `ban.manage_kosk` and `platform.ban_scoped` already do. Not edited; the owner
  decides the wording (tr, en, ar).
- **"Dersin yasak listesini görmeyi kapsar"** (inside `ban.course`'s sentence): there is no per-course ban
  list route; the lists are the köşk's, the medrese's and the Medaris one.
- **`platform.ban_account`** reads and nothing else: the account ban (the account closes) is MDRS-197.
- **Not built, as told:** a platform ban scope or the Keycloak disable (MDRS-197), device recognition
  (MDRS-125), appeals (MDRS-139).
- **A nazır with `madrasah.ban` only** loses what main gave by role (placing and lifting course bans
  through the medrese route). That is the strict reading of "the permission at a level lifts at that
  level"; reading `madrasah.ban` as reaching the medrese's courses too is one row of `ban-codes.ts`.
- The nazır and nizam screens read `viewerMayLift`, `viewerMayExtend`, `viewerMayEscalate` and
  `viewerMayRequestPermanent` from the API and need no change; the error codes (`BAN_FORBIDDEN`,
  `BAN_LIFT_FORBIDDEN`) are the same, and a `BAN_FORBIDDEN` body now names the permissions it asked in
  `context.permission`.
