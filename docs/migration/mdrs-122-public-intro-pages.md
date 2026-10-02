# MDRS-122 — köşk, medrese and course pages without signing in; the unlisted köşk

## Scope

The Linear issue was not read: no Linear MCP tool was available in the session
that did this work. The scope is the task brief handed to that session, plus the
follow-ups MDRS-45 and MDRS-103 left for this issue
(`docs/migration/mdrs-45-authz-public.md`, `docs/migration/mdrs-103-course-content-access.md`):

- MDRS-45's `@AuthzPublic` + `resolveAnonymous` mechanism applies to the köşk,
  medrese and course list and detail reads. No second mechanism.
- A caller with no token gets MDRS-103's filtered course body, unchanged.
- A token that is present but invalid is still 401.
- `kosks.is_private` means **unlisted**: in no list or search; opened by its
  link to a signed-in caller; 404 without a token; every enrollment in its
  courses waits for approval. New köşks default to listed, and 0022 lists
  every existing köşk (owner decision, 2026-10-02).
- Passive and DRAFT courses are 404 without a token. "Passive" is read as
  hidden (`courses.archived_at`, MDRS-124): it is the only inactive state a
  course has. Köşks and medreses have no passive or draft state today, so
  there is nothing more to close for them.
- tedris: köşk, medrese and course pages open; lesson pages closed; the course
  page's sticky card says "Başvurmak için giriş yap" to a signed-out visitor;
  title, description and Open Graph metadata from an anonymous fetch.

Role model v2 (imam, ders nazırı, permission catalogue, `/me` effective
permissions) is MDRS-134/135/142 and is not in this change. Where it plugs in
is at the end.

## What changed

### `libs/common`

`MATRIX` gets an `ANONYMOUS` row on `course`, `kosk` and `madrasah`, each
`[VIEW]` and nothing else. No ENROLL (applying needs an account), no DONATE, no
create scope; `canAnonymous` still inherits nothing from PUBLIC. `ijazah` has
no ANONYMOUS row. `auth-matrix.spec.ts` pins the four rows exactly.

### `apps/tedrisat`

**Resolver.** `TedrisatRoleResolver.resolveAnonymous` answers three more
entities. Each one answers a resource the caller may not see with the module's
own 404, the same code and message as a resource that does not exist:

| Entity | ANONYMOUS | 404 |
| -- | -- | -- |
| köşk | listed köşk; any non-UUID id (the pipe's 400 follows) | missing, or `is_private` |
| course | PUBLISHED, not hidden, köşk listed; any non-UUID id | missing, DRAFT, hidden (`archived_at`), or its köşk is `is_private` |
| medrese | exists; any non-UUID id (the list's `any` sentinel) | missing |

The course check is one query (`CourseRepository.findPublicVisibility`, courses
⋈ kosks). The köşk check is `KoskService.findVisibility` (one column).

**Routes marked `@AuthzPublic()`** (all keep their class-level
`@UseGuards(AuthGuard, AuthzGuard)`):

| Route | No token |
| -- | -- |
| `GET /kosks` | listed köşks; `managedBy=me` is 401 |
| `GET /kosks/:id` | 200, or 404 for an unlisted köşk |
| `GET /kosks/:koskId/courses` | the published shelf, no enrollment; 404 for an unlisted köşk; `archived=true` is 401 |
| `GET /courses/:id` | MDRS-103's body (`contentLocked: true`), or 404 |
| `GET /madrasahs` | 200 |
| `GET /madrasahs/:id` | 200, or 404 |

`GET /kosks` replaced `@AuthzExempt()` with `@AuthzPublic()`, as MDRS-45 did
for the deck list. The other five add the marker next to their existing
`@Authz(VIEW, …)`. Every write next to them (follow, enroll, PATCH, POST) is
unchanged and is 401 without a token.

**Services take a null caller.** `KoskService.findAll/findById`,
`CourseService.findSummariesByKosk/getDetail/viewDetail/present` and the two
course repository reads accept `null` for "no token". A null caller follows
nothing and has no enrollment — written as SQL `false`, not left to how
`user_id = NULL` compares. `CourseService.present(course, null)` returns
`withoutContent(course)`: the anonymous body is MDRS-103's filter, not a second
one. `getDetail` repeats the DRAFT and hidden rules for a null caller, so the
answer does not rest on the guard alone.

**Unlisted köşk.**

- `KoskRepository.listWhere`: without `managerId`, the listing adds
  `is_private = false` — for every caller, signed in or not, the köşk's own
  manager and SYSTEM_ADMIN included. `managedBy=me` (nizam's list) still shows
  the manager their unlisted köşks.
- `GET /kosks?madrasahId=<uuid>` (new, optional) narrows the list to one
  medrese's köşks, unlisted ones still out. tedris' medrese page uses it.
- `CourseService.enroll`: a course of an unlisted köşk always lands PENDING,
  whatever its own `requires_approval` says.
- Search: tedrisat has no search endpoint. tedris' köşk search
  (`KoskListPage`) filters the page `GET /kosks` returned, so it cannot find an
  unlisted köşk either. The only course lists are a köşk's shelf (reachable
  only through the köşk) and the caller's own (`courses/enrolled`, `GET /me`,
  the calendar feed), so an unlisted köşk's courses are in no public list.

**Migration 0022** (`0022_kosk_listed_by_default.sql`) is two statements:
`ALTER TABLE "kosks" ALTER COLUMN "is_private" SET DEFAULT false`, then
`UPDATE "kosks" SET "is_private" = false WHERE "is_private" = true`, which
lists every existing köşk. The rollback is
`rollbacks/0022_kosk_listed_by_default.down.sql` (`SET DEFAULT true`); it
touches no row, because what was unlisted before 0022 is not recorded. `CreateKoskDto.isPrivate` documents
`default: false`; nizam's köşk form starts unchecked for a new köşk.

**OpenAPI.** Descriptions on the six operations and on `isPrivate`, the
`default: false`, and the `madrasahId` query parameter. Regenerated with
`pnpm run openapi:tedrisat`. As in MDRS-103, generated files whose only change
was the `The version of the OpenAPI document` header were left out. The
operations still carry `security: [{ bearer: [] }]` from the class's
`@ApiBearerAuth()` — MDRS-45's open follow-up, unchanged here.

### `apps/tedris`, `libs/services`, `libs/i18n`, `apps/nizam`

- `lib/public-paths.ts`: `/kosks/<id>`, `/madrasahs/<id>` and `/courses/<id>`
  (one segment, any locale prefix) are public. `/courses/<id>/lessons/<id>`
  is not: the middleware still sends a signed-out visitor to sign in.
- Course page sticky card: signed out, the primary button is a link
  "Başvurmak için giriş yap" to the sign-in page with the course as
  `callbackUrl` (same pattern as B8). Signed in, the label is "Kayıt iste"
  when the course requires approval **or its köşk is unlisted**
  (`approvalRequired`, computed by the page from `course.requiresApproval` and
  `kosk.isPrivate`).
- `generateMetadata` on the köşk, medrese and course pages: title
  (`<name> · Tedris`), description (shortened to 200 characters), canonical
  path, Open Graph and a Twitter summary card, through
  `features/courses/intro-metadata.ts`. The read is **anonymous whoever is
  looking** (`features/courses/public-reads.ts`): an unlisted köşk, a draft or
  a hidden course gets the generic title, so a link preview never names
  something a signed-out visitor cannot open. `metadataBase` is `NEXTAUTH_URL`.
- New medrese page `app/[locale]/madrasahs/[madrasahId]`: header card and a
  grid of its listed köşks. There is no drawing for it; it reuses the köşk
  page's header card and card styles (`design-system/` mirror read for the
  button rule: one primary per surface). The köşk page links to its medrese.
- `createTedrisatAPIs` exposes `madrasahs` (`MadrasahsApi`), and the package
  re-exports `MadrasahResponse` and `PaginatedMadrasahResponse`.
- i18n (`tr`, `en`, `ar`): `tedris.CoursePage.signInToApply`,
  `tedris.KoskPage.madrasah`, `tedris.MadrasahPage.{kosks,noKosks}`;
  `tedris.KoskPage.private` and nizam's `KoskForm.private`/`privateHint` now
  say "Liste dışı" / "Unlisted" and describe the new meaning.

## What was verified

All runs used the prefix `env -u NODE_ENV -u DB_PORT -u POSTGRES_DB -u POSTGRES_USER -u POSTGRES_PASSWORD -u DATABASE_URL`.

| Gate | Result |
| -- | -- |
| `typecheck` | 17 projects green |
| `lint` | 17 projects green |
| `module-boundaries` | 17 projects green |
| `build` | 8 projects green |
| `test` | 9 projects, 87 files, 1486 tests green (tedrisat 50 files / 785 tests, tedris-web 7 / 45, common 7 / 88, nizam-web 6 / 42) |
| `tools/ci/biome-ratchet.mjs` | warnings 75, infos 24 — equal to baseline |
| `tools/ci/assert-openapi-spec-fresh.mjs` | 55 paths, identical |
| release-config, env-compose-parity, affected-isolation | exit 0 |

- `test/e2e/public-pages.e2e.spec.ts` (new) runs the real `AuthGuard` against
  the run's stubbed signing key, no live Keycloak. It pins: the anonymous and
  the signed-in list leave the unlisted köşk out (its manager's plain list
  too) and `managedBy=me` keeps it; `managedBy=me` without a token is 401;
  `madrasahId` narrows and a malformed one is 400; an unlisted köşk is 404
  without a token with the same code and message as a missing one, and 200
  with one; its shelf is 404; the anonymous shelf is published-only with no
  enrollment; `archived=true` without a token is 401; the anonymous course body
  carries no content marker; DRAFT, hidden and unlisted-köşk courses are 404
  with the missing-course code and message; a signed-in caller opens the
  unlisted course, still filtered; medrese list and detail; enrollment in the
  unlisted köşk lands PENDING with `requires_approval = false`, elsewhere
  ENROLLED; six writes are 401 without a token; six invalid-token shapes
  (expired, unknown `kid`, tampered, not a JWT, non-Bearer, empty Bearer) are
  401 on each of the six public reads.
- `test/e2e/kosk-listed-by-default-migration.e2e.spec.ts` (new) applies the
  migrations up to 0021, inserts köşks, runs 0022, the rollback and 0022 again:
  every existing row is byte-identical after each step, and the default is
  false, true, false.
- `course.e2e.spec.ts`: MDRS-103's "still requires a token" became "no token
  gets the filtered body, a broken token is 401". `kosk.e2e.spec.ts`: a köşk
  created without `isPrivate` is now `false`.
- `tedrisat-role-resolver.spec.ts`: the new branches; `nizam-kosk-buttons.spec.ts`:
  the köşk list is `@AuthzPublic` now.
- tedris: `auth-pages.spec.ts` (intro pages public in every locale, lessons
  and lists not; the middleware redirects a lesson and lets a course through),
  `public-intro-pages.spec.ts` (the sticky card's signed-out link and
  `callbackUrl`, the approval label, the key in all three locales, the
  metadata and its generic fallback).

## What was not verified

- **No browser.** The pages were not opened against a running stack: no dev
  server, no live Keycloak. The card and the metadata are covered by
  server-render and unit tests only; the medrese page has no render test.
- **Link previews** were not checked with a real crawler or preview tool.
- **The production `is_private` rows.** No live database was queried; how many
  köşks are unlisted after this release is not known (see the query below).

## The owner's decision: köşks that are unlisted today

Every köşk created before 0022 without an explicit `isPrivate` got the old
default, `true`. Left alone, those köşks would disappear from every list,
answer 404 to signed-out visitors, and turn every new enrollment in their
courses into PENDING — `CourseService.enroll` treats an unlisted köşk as
requiring approval, whatever the course's own `requires_approval` says.

The owner decided on 2026-10-02 that **every existing köşk is listed**, so
0022 carries the UPDATE. A köşk that should be unlisted is unlisted again by
hand afterwards, in nizam's köşk form or with a PATCH. The read-only query
below, run before the release, shows which köşks the UPDATE will list:

```sql
-- Köşks that are unlisted (is_private = true). Read-only.
SELECT k.id,
       k.name,
       k.handle,
       k.created_at,
       (SELECT count(*) FROM courses c
         WHERE c.kosk_id = k.id AND c.archived_at IS NULL)        AS live_courses,
       (SELECT count(*) FROM courses c
         WHERE c.kosk_id = k.id AND c.archived_at IS NULL
           AND c.status = 'PUBLISHED')                            AS published_courses,
       (SELECT count(*) FROM kosk_followers f WHERE f.kosk_id = k.id) AS followers
FROM kosks k
WHERE k.is_private = true
ORDER BY k.created_at;
```

## Follow-ups (not opened as issues)

- **User ids in anonymous bodies.** `KoskResponse.managerIds`,
  `MadrasahResponse.nazirIds`, `courses.authorId` and `muderris[].userId` are
  Keycloak `sub`s, now visible without an account — the same open question
  MDRS-45 left for `FlashcardDeckResponse.authorId`. An intro-only anonymous
  shape changes the published contract and the generated client.
- **OpenAPI optional security** on the public operations (MDRS-45's follow-up).
- **nizam's course editor** does not say that "requires approval" is forced on
  in an unlisted köşk. The API enforces it; the toggle can mislead.
- **`/learning`** (the köşk list page) stays behind sign-in; the breadcrumbs on
  the public pages link to it. Opening it to guests is a product decision.
- **A medrese page drawing** and a medrese list page in tedris. The page
  shows the first 50 listed köşks (`GET /kosks`' page cap) and does not page.
- **A followed unlisted köşk** is no longer in tedris' `/learning` list,
  "following" filter included: that filter works on the page `GET /kosks`
  returned. A "köşks I follow" read (`followedBy=me`) would bring it back.
- **Card reads on public decks** (MDRS-45's follow-up) and a closed course's
  sample lesson (`is_preview`) are still not open to anonymous callers.

## Role model v2 hook (MDRS-134/135/142)

- **The anonymous decision** is `TedrisatRoleResolver.resolveAnonymous` plus the
  three ANONYMOUS rows. v2's permission catalogue replaces the rows with the
  catalogue's public grants; the 404 rules (unlisted, DRAFT, hidden) stay in
  the resolver because they are visibility, not permission.
- **The unlisted rule** lives in two places: `KoskRepository.listWhere`
  (listing) and the resolver (detail). A v2 "who may see an unlisted köşk"
  rule (members only, invited only) would be a new branch in
  `resolveKoskRole` for signed-in callers — today any signed-in caller opens
  it by its link.
- **Forced approval** is one line in `CourseService.enroll`; v2's enrollment
  policy (per köşk, per course) replaces it.
- **`/me` effective permissions** would let tedris pick the sticky card's
  state from the API rather than from `kosk.isPrivate` and
  `course.requiresApproval`.
