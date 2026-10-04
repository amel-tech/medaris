# MDRS-223 — the Nazır menu offers a medrese nazırı only what they may open

## Finding

From the 2026-10-03 dev-environment e2e run (LOW): a medrese nazırı with no
permission saw the same ten menu entries as the medrese's başmüderris (Pano,
Bildirimler, Dersler, Talebeler, Medrese nazırları, Yasaklamalar, İtirazlar,
Arşiv, Kabul kuralları, Medrese ayarları), and every built one opened
"Bu sayfaya izniniz yok". Access control was right and nothing leaked; only the
menu over-promised.

Re-checked against `origin/main` at `24affc9c` before any change: `navFor`
(`apps/nazir/features/shell/nav.ts`) returned `NAV[scope.kind]` whole, with no
input but the scope's kind and id. Not fixed by #179 or #181–#195.

## What decides access today

Every page under `/medrese/<id>` reads a tedrisat route that carries
`@Authz(SCOPES.MANAGE_MADRASAH, byExistingMadrasah)`:

| Page | Routes (handler) |
| -- | -- |
| Pano | `MadrasahPortalController.dashboard` |
| Dersler | `MadrasahController.findCourses`, `MadrasahCourseController.hostingKosks` |
| Talebeler | `MadrasahPortalController.students`, `findCourses` |
| Medrese nazırları | `MadrasahNazirController.list`, `MadrasahPermissionController.groups` |
| Yasaklamalar | `MadrasahBanController.list`, `findCourses` |
| Arşiv | `MadrasahArchiveController.list` |
| Medrese ayarları | `MadrasahController.getSettings`, `findCourses` |

`MANAGE_MADRASAH` is on the matrix's `MADRASAH_NAZIR` row only, and
`resolveMadrasahRole` gives that row to a holder of `MEDRESE_BASMUDERRIS` in the
medrese (`MadrasahRepository.isNazir`). A `MEDRESE_NAZIR` resolves to `PUBLIC`,
which does not hold it. Grants (`madrasah.*` codes from `GET
/me/effective-permissions`) do not open these routes yet — role model v2
(MDRS-135) is where they will.

İtirazlar and Kabul kuralları are placeholders that read nothing.

## What changed

- `apps/nazir/features/shell/abilities.ts` (new): `headsMedrese(scope)` and
  `mayOpenScopePages(scope)`. They read the scope's role, which the portal
  already has from `GET /me/assignments` (the same `role_assignments` the API's
  resolver reads), never a token claim. No second permission table: one rule,
  "a medrese's pages are its başmüderris's", mirroring the one matrix row.
- `navFor` takes the scope's role and keeps only the entries `mayOpenScopePages`
  allows (Bildirimler, a global page, always stays); a section left empty is
  dropped with its heading. A medrese nazırı's menu is now Genel → Bildirimler.
  A course's menu is unchanged: its sections are placeholders with no API read.
- `panoHref`: a course's Pano opens the first medrese the person **heads**, not
  the first they are a nazır of, else the course's own overview — so the
  course menu's Pano no longer leads a medrese nazırı to a refused dashboard.
- Pages are untouched: tedrisat stays the guard, and a page reached by its
  address still says "Bu sayfaya izniniz yok".

## Verified

- Unit: `apps/nazir/test/abilities.spec.ts` (new), new cases in `nav.spec.ts`
  (başmüderris full menu of 10; medrese nazırı → only Bildirimler; a course
  menu whole for MUDERRIS and DERS_NAZIR), `portal-frame.spec.tsx` (rendered
  sidebar of a medrese nazırı has no medrese link), `scope.spec.ts` (Pano from
  a course skips a medrese the person is only a nazır of).
- Matrix pin: `apps/tedrisat/test/unit/authz/nazir-medrese-menu.spec.ts` (new,
  36 cases): each route above carries `MANAGE_MADRASAH`, the `MADRASAH_NAZIR`
  row holds it, `PUBLIC` does not. When MDRS-135 opens a route to a nazır, the
  `PUBLIC` case fails and points here. Count measured with
  `pnpm exec vitest run test/unit/authz/nazir-medrese-menu.spec.ts` from
  `apps/tedrisat`: `Tests  36 passed (36)`, `Test Files  1 passed (1)`.
- The full gate (typecheck, test, build, lint, module-boundaries) — numbers in
  the PR.

## Not verified

- No browser run against the dev environment with a real medrese nazırı
  account; `apps/nazir/e2e/shell.e2e.ts` was updated to expect only
  "Bildirimler" but Playwright e2e needs live Keycloak sign-ins and was not run.
- The resolver half (`isNazir` reading `MEDRESE_BASMUDERRIS`) is read from the
  code, not pinned by a new test: `NAZIR_ROLE` is module-private.

## Follow-ups

- Role model v2 (MDRS-135): when grants open medrese routes, switch
  `abilities.ts` to `GET /me/effective-permissions` per page.
- A medrese nazırı still lands on `/medrese/<id>` (`defaultScope` prefers a
  medrese), whose Pano answers 403; landing them on a scope they can open is a
  product decision not made here.
- A SYSTEM_ADMIN who also holds MEDRESE_NAZIR passes the API by the realm
  bypass but now sees the narrowed menu; `/me/assignments` does not say
  `systemAdmin`. Edge case, not handled.
- A course's menu is not narrowed for DERS_NAZIR; when its sections get real
  pages, give them the same treatment.
