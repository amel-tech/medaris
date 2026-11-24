# MDRS-211 — The köşk-wide Celseler, Talebeler and Ders kayıtları

The canvas of Nizam's köşk menu (nizam/52, nizam/53) holds three entries the code did not: Celseler,
Talebeler and Ders kayıtları for the whole köşk. The first pass at MDRS-211 (PR #181, October) took the
links to them out of the menu so that none answered 404; `apps/nizam/lib/shell-nav.ts` said "later-phase
screens with no route yet (MDRS-211)". This builds the three pages and the three reads under them.

Stacked on MDRS-194 (`argedikas/mdrs-194-kalici-yasak-kararlari`). Every number below sits next to the
command that printed it; commands run from the repository root.

## Decided by the owner (24 November 2026)

1. The three pages list across every course of the köşk; the routes sit under
   `apps/nizam/app/kosks/[id]/` with Turkish segments, like the menu's other entries.
2. Three new read-only routes, köşk-scoped, on the permission pattern of the köşk menu's existing
   routes; no new permission code.
3. No write is rebuilt: each row leads to the course's own page. The one exception is the number of
   waiting applications, with its link, on Talebeler.
4. Celseler: upcoming and past, by date, with the course's name. Talebeler: a row a person, with the
   courses they hold. Ders kayıtları: grouped by course and week. Paging and filtering on the existing
   pattern.
5. The menu entries go in the order of the canvas; "Bütün celseler" and "Tümünü gör" go to the
   köşk-wide page.

## What was built

### tedrisat

`KoskListsController`, `KoskListsService`, `KoskListsRepository` and `dto/kosk-lists.dto.ts` in
`apps/tedrisat/src/kosk/`. No migration: nothing in the schema changes.

| Route | operationId | Permission |
| --- | --- | --- |
| `GET /kosks/:id/sessions?tab=UPCOMING\|PAST&page&limit` | `listKoskSessions` | `kosk.manage` or `platform.kosk_edit` |
| `GET /kosks/:id/students?q&page&limit` | `listKoskStudents` | `kosk.manage` |
| `GET /kosks/:id/recordings?page&limit` | `listKoskRecordings` | `kosk.manage` |

- The permissions are the ones `GET /kosks/:id/dashboard` and `/course-roster` carry. Two of the
  three are `kosk.manage` alone, because `platform.kosk_edit` covers neither personal data nor course
  content, exactly as the dashboard gives its holder no applicant and no link. Talebeler hands out
  names and e-mail addresses. Ders kayıtları lists every recording, where a course's own content rule
  (`visibleRecordings`: visibility, a closed course, a failed upload) would show such a caller only
  some. The başnazım passes by the bypass.
- **Celseler**: live sessions of the köşk's published, shown courses. `UPCOMING` is everything not over
  yet (a session with no length is given an hour), soonest first; `PAST` everything over, latest first.
  A cancelled session stays listed and says so. **No meeting link is sent**, and how a session is
  attended (`inPerson`) only to a caller holding `kosk.manage`, as on the dashboard (MDRS-283).
- **Talebeler**: everyone with an enrolled or completed seat in a shown course of the köşk, one row a
  person, newest first by first enrollment, each with all of their courses there; `q` matches the
  account's name or e-mail and the ones the seat was taken with, which is what a course's roster shows; `pendingCount` is the number of waiting applications. Every read is written to `audit_log` as
  a roster read on the köşk (`details.via = "kosk-students"`), before the list is returned.
- **Ders kayıtları**: the recordings of the köşk's shown courses with course, week, session time,
  source, status and visibility, ordered by course, then the latest week. **No address is sent.**
- A course in a passive scope is left out of all three for everyone but the köşk's nazımları and
  holders of `platform.inactive_scopes_manage`, as on the dashboard.
- Page size 20 by default, 50 at most; a page number past 100000 is read as 100000.

### nizam-web

- `/kosks/[id]/celseler`, `/kosks/[id]/talebeler`, `/kosks/[id]/ders-kayitlari`, each with a
  `loading.tsx`; `features/kosk-lists/` holds the reads, the pure rules and the three views.
- The tab, the page and the search live in the address (`?sekme=gecmis`, `?sayfa=`, `?ara=`), so the
  server reads exactly the page shown. The tabs and the pager are links and the search is a plain GET
  form: none of it needs the page's script.
- A session that has started and is not over reads "Şu an canlı" among the upcoming ones.
- A session leads to its course's own Celseler, a talebe's course to that course's Talebeler, a
  recording's course to its Celseler. Talebeler shows "Onay bekleyen N başvuru var." with the way to
  Başvurular when any wait.
- Menu (`lib/shell-nav.ts`), in the canvas's order: Dersler, Celseler, Talebeler, Başvurular, Ders
  talepleri, Ders kayıtları, Köşk desteleri, Yasaklamalar, Arşiv. The labels were already in
  `nizam.Shell.items`.
- `coursePathAlias`: a course's own Celseler and Talebeler now draw the köşk-wide entries of the same
  name selected; the course's other pages still draw Dersler.
- The köşk home's Celseler card gains "Tümünü gör" to `/kosks/:id/celseler`; a course overview's "Bütün
  celseler" goes there too.

### i18n and the client

`nizam.KoskLists` in tr, en and ar together. `libs/services` regenerated with `pnpm openapi:tedrisat`
(the version-only header lines put back to `0.2.0`, as in MDRS-194).

## Departures and consequences

- **The canvas draws these lists for one course** (nizam/56, 57 and 59), with every action on the row.
  The köşk-wide pages are read-only by decision 3, so the buttons of those canvases ("Bağlantıyı
  güncelle", "Onayla", "Yeniden adlandır", "Ders kaydı ekle", …) are not here; the column names and the
  status words are taken from them.
- **A course overview no longer links straight to that course's own Celseler.** "Bütün celseler" was
  its only link there and now goes to the köşk-wide page (decision 5); the course's own page is one
  click further, from the row of that list, and from the müfredat editor as before.
- **The menu's counts are not drawn.** The canvas shows "7" on Dersler and "1 bağlantısı eksik" on
  Celseler; the menu carried neither before and does not now.
- **Ders kayıtları has no course page of its own in Nizam**, so a recording's course leads to that
  course's Celseler, where its recordings are worked on.
- **Ders kayıtları groups a page, not the list.** With more than 20 recordings, a course or a week can
  continue on the next page.

## Review findings

`/code-review` over `argedikas/mdrs-194-kalici-yasak-kararlari...HEAD` returned nine findings, all
fixed: Ders kayıtları showed a `platform.kosk_edit` holder recordings the course's content rule hides
from them (the route is `kosk.manage` alone now); Celseler sent `inPerson` to that holder; two
Playwright assertions still pinned the menu without the new entries; the talebe search did not match
the name and address a seat was taken with; a session under way read "Planlandı"; a failed köşk read
turned a list that was read into "Sayfa bulunamadı"; a huge `?sayfa=` showed the error state; a page
past the end said the list had nothing at all; the English and Arabic page titles differed from the
menu's labels. The security pass found no vulnerability and added the cap on the page number.

## Verified

| What | Command | Result |
| --- | --- | --- |
| The three routes | `pnpm --filter ./apps/tedrisat exec vitest run test/e2e/kosk-lists.e2e.spec.ts` | `Tests  13 passed (13)`: the lists, paging, search (the seat's name too), no link and no address in the response, the audit row, 200 for the köşk's nazım and the başnazım, 403 for another köşk's nazım, a stranger and a bare Medaris nazımı, 401 without a token, 404 for no such köşk, empty lists for an empty köşk, the passive course left out for a `platform.kosk_edit` holder, who gets neither Talebeler nor Ders kayıtları and the sessions without `inPerson` |
| The route inventory | `test/e2e/authz-route-inventory.e2e.spec.ts` | `Tests  1 passed (1)` with the three routes in the snapshot |
| The three pages and their rules | `test/kosk-lists.spec.tsx` in the nizam run | part of `Tests  999 passed (999)` |
| typecheck | `pnpm nx run-many -t typecheck --skip-nx-cache` | `20 tasks: 20 succeeded` |
| build | `pnpm nx run-many -t build --skip-nx-cache` | `16 tasks: 16 succeeded` |
| lint | `pnpm nx run-many -t lint --skip-nx-cache` | `18 tasks: 18 succeeded` |
| module-boundaries | `pnpm nx run-many -t module-boundaries --skip-nx-cache` | `18 tasks: 18 succeeded` |
| OpenAPI freshness | `pnpm assert:openapi-fresh` | `263 paths, identical to what the exporter writes today` |
| tests | `pnpm nx run-many -t test --skip-nx-cache`, read from each `coverage/junit.xml` | nizam `tests="999" failures="0"`, nazar `tests="1896" failures="0"`, tedris `tests="1360" failures="0"`, tedrisat `tests="3946" failures="3"`, keycloak-theme `tests="645" failures="1"` |

The four failures are the suites that start a Keycloak container (`keycloak-audience`, `keycloak-smtp`,
`partner-enrollment-keycloak`, and keycloak-theme's `email.e2e`), refused with `403 HTTPS required` by
the container on the machine this was written on. They fail the same way on the branch below, are not
touched by this change, and are described in `mdrs-194-kalici-yasak-kararlari.md`. CI is where they
are decided.

## Not verified

- **Nothing was tried by hand in a browser.** The dev environment only carries this after a merge.
- **The Playwright suites** (`apps/nizam/e2e/`) were edited where they pinned the old behaviour
  (`shell.e2e.ts`, `assignments.e2e.ts`) and were not run: they need a signed-in dev environment.
- **Arabic and English wording** was written with the neighbouring pages' vocabulary and not reviewed
  by a speaker.
- **Behaviour on a köşk with thousands of talebe.** The talebe query groups the köşk's seats on every
  read; it was measured on nothing larger than the test's six rows.
