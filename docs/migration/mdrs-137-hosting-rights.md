# MDRS-137 — Hosting rights: the way in for a Medaris nazımı, and the proof of the criteria

Stacked on MDRS-205 (`4e039281`, main + MDRS-135 + MDRS-205). No migration, no route, no DTO, no catalogue
code, no new copy: the OpenAPI spec, the client and the route inventory are unchanged
(`node tools/ci/assert-openapi-spec-fresh.mjs`: "167 paths, identical to what the exporter writes today";
`authz-route-inventory.e2e.spec.ts` passes without `-u`). Every number below was read off the command named
next to it.

## What was already there

MDRS-170 (PR #146) built the whole flow for the başnazım and the köşk nazımı: `GET/POST/DELETE
/kosks/:id/hosting-rights`, `GET /madrasahs/:id/hosting-kosks`, the audit rows `hosting_right.grant` and
`hosting_right.revoke`, the nizam screen "Barındırma hakları" with its grant and withdrawal dialogs, and the
nazir list in "Ders aç". MDRS-135 added `platform.hosting_grant` to all three handlers, the `MEDARIS_NAZIM`
granter role and the hide kademe (a Medaris nazımı hides at the platform's level). The earlier audit that said
`platform.hosting_grant` "has no consumer" predates that and is stale.

Two things were missing:

1. nizam: a Medaris nazımı holding `platform.hosting_grant` could not find the screen. `/kosks/:id` sent
   everyone who is neither the başnazım nor the köşk's nazımı to the forbidden screen, the köşk directory
   links there, and the screen's own tabs and breadcrumb link to pages that are a 403 for that person
   (`ayarlar` and `ayarlar/nazimlar` ask for `kosk.manage | platform.kosk_edit`).
2. Tests: nothing pinned the refusals for a Medaris nazımı, nor the başmüderris on the list and the
   withdrawal, and the second acceptance criterion had its two halves in two files.

## What changed

- `apps/nizam/features/kosks/kosk-entry.ts` (new): `koskEntry(me, koskId, rights)` decides where `/kosks/:id`
  sends the person: `management` (the başnazım, or roles unreadable, as before), `dersler` (this köşk's
  nazımı), `hosting` (anyone else whom tedrisat let read the köşk's hosting rights) or `forbidden`.
  `needsHostingRead` says when the roles alone do not settle it, so the page reads the hosting rights only
  then. nizam does not copy the permission rule (it may not import the catalogue): the API's answer to the
  read is the rule. A 403 and a 404 both give the forbidden screen, so a köşk that is not there leaks nothing.
- `apps/nizam/app/[locale]/kosks/[id]/page.tsx` uses it. Nobody who got in before is affected.
- `HostingView` takes `settingsTabs` (default `true`). The barındırma page passes
  `nazims !== "forbidden"` from `getKoskNazims`, the read the sibling settings pages gate on. When false the
  breadcrumb's "Köşk ayarları" is plain text and the tab strip is not drawn; the grant and withdraw buttons
  stay, because the API allows them.
- `role-assignment.schema.ts`: two comments refreshed (the flows exist; `MEDARIS_NAZIM` can be the granter).
  `course.schema.ts:59` still reads true and was left.

## Behaviour changes callers will see

- A Medaris nazımı holding `platform.hosting_grant` who opens a köşk from the "Köşkler" list now lands on
  "Barındırma hakları" instead of "Bu bölüm için izniniz yok". On that page the "Genel" and "Köşk nazımları"
  tabs are gone.
- A Medaris nazımı holding only `platform.kosk_edit` or `platform.kosk_nazim_manage` still gets the forbidden
  screen on the köşk page. That wider gap (nizam's köşk pages for Medaris nazımları, MDRS-107 / MDRS-142)
  is not closed here.
- Nothing changes in tedrisat: no route answers differently.

## Decided by default, owner may overrule

- **D1.** The withdrawal dialog keeps "no answer chosen until the person picks one" (as MDRS-170 drew it),
  although the issue calls keep "the default". Option (b): preselect "Dersler sürsün" (`RevokeDialog` initial
  choice `KEEP`; the `canRevoke` test in `hosting.spec.tsx` flips). Default: (a), as built.
- **D2.** A Medaris nazımı enters through a redirect from the köşk page to "Barındırma hakları". Alternatives:
  a reduced köşk page, or leave it. Default: the redirect; it is additive.
- **D3.** DELETE stays ask-then-withdraw (the list read carries `openCourses` and feeds the dialog; DELETE
  answers 204 and the audit row names what was hidden), not "answer with the courses". Default: as built.
- **D4 (mine).** The tabs are hidden only when the nazımlar list answers 403, not when it fails: an API blip
  must not take the tabs away from a köşk nazımı. The scout's cut said `Array.isArray(nazims)`.

## Tests, with red-then-green

Commands from `apps/tedrisat` through the slot wrapper, from `apps/nizam` directly.

| Criterion | Test | Fails without the change |
| --- | --- | --- |
| A köşk nazımı grants on their köşk, 403 on another | `hosting.e2e.spec.ts` "lets the köşk nazımı give a medrese the right..." and "refuses another köşk's nazımı and the medrese's başmüderris with 403" | already covered by MDRS-170; not re-mutated here |
| After revoking, courses stay unless HIDE, and the medrese cannot open new ones | "after KEEP the medrese's courses stay and it can open no new course in that köşk", "after HIDE the same refusal holds...", "giving the right back lets the medrese open a course again" (the real DELETE, then the real `POST /madrasahs/:id/courses`) | yes: with `isNull(madrasahKoskHosting.revokedAt)` removed from `madrasah-course.repository.ts`, all three fail (`Tests  3 failed \| 25 passed (28)`) |
| A başmüderris cannot grant, and cannot list or withdraw | "refuses ... the medrese's başmüderris with 403" on GET and DELETE (right still held, no audit row, course still visible) | yes: with `@AuthzExempt()` instead of `@Authz(...)` on `list` and `revoke`, 11 tests fail, among them the başmüderris and stranger ones (`Tests  11 failed \| 17 passed (28)`) |
| A Medaris nazımı with the permission works in any köşk | "holding platform.hosting_grant lists, gives and withdraws in any köşk" (two köşkler, `grantedBy.role` `MEDARIS_NAZIM`, audit rows with the actor) | yes: with `PLATFORM_HOSTING_GRANT` dropped from the three `@Authz` lists, it fails (`Tests  1 failed \| 27 passed (28)`) |
| A Medaris nazımı without it, or with another platform permission, is refused with nothing written | "with no grant ...", "holding only platform.kosk_edit ..." | yes for kosk_edit: with `PLATFORM_KOSK_EDIT` added to the list route's codes it fails (`Tests  1 failed \| 27 passed (28)`); the no-grant case is also in the `@AuthzExempt()` run above |
| An expired `platform.hosting_grant` is refused | "whose grant has expired is refused like one with no grant" | yes, with a caveat: it fails when `grantHeld()` in `assignment.repository.ts` stops filtering `expires_at` (`1 failed \| 27 passed`); it stays green when only the in-memory `live()` filter in `effective-permissions.ts` is removed, because the SQL filter already drops the row, so it pins the loader, not the second layer |
| nizam: the Medaris nazımı reaches the page | `apps/nizam/test/kosk-entry.spec.ts` | yes: with `koskEntry` always answering `forbidden` for non-managers, "sends a Medaris nazımı whom the API lets read the rights..." fails (`Tests  1 failed \| 8 passed (9)`) |
| nizam: the köşk page sends that person there, and reads the rights only when it must | `apps/nizam/test/kosk-page.spec.tsx` (the page rendered with its reads mocked and `redirect`/`forbidden` throwing) | yes, two mutations of `kosks/[id]/page.tsx`: reading the rights for everyone fails 2 tests (`Tests  2 failed \| 4 passed (6)`: this köşk's nazımı and the başnazım); dropping the `hosting` redirect fails the Medaris nazımı one (`Tests  1 failed \| 5 passed (6)`). The old forbidden-for-everyone logic is covered by the second, since the test expects the redirect |
| nizam: no dead tabs for that person | `hosting.spec.tsx` "leaves out the settings tabs and their links when they would be a 403" | yes: with the view ignoring `settingsTabs`, it fails (`Tests  1 failed \| 20 passed (21)`) |

Runs on the final tree:

- `vitest run test/e2e/hosting.e2e.spec.ts test/e2e/authz-route-inventory.e2e.spec.ts test/e2e/hide-kademe.e2e.spec.ts test/e2e/madrasah-course.e2e.spec.ts`
  in `apps/tedrisat`: `Test Files  4 passed (4)`, `Tests  85 passed (85)`; `hosting.e2e.spec.ts` alone: 28 tests.
- `vitest run` in `apps/nizam`: `Test Files  40 passed (40)`, `Tests  656 passed (656)`.
- `tsc -b` in `apps/nizam` and `tsc --noEmit` in `apps/tedrisat`: no output. `biome check` on the touched files:
  clean (two pre-existing `noExplicitAny` warnings in `apps/nizam/middleware.ts`).

## Not verified

- The page's wiring is unit-tested with its reads mocked (`kosk-page.spec.tsx`), not in a running Next with
  a real session. No Playwright spec was added or run (it needs Keycloak and Docker, and an account holding
  only `platform.hosting_grant`), so "a Medaris nazımı can open the screen from the Köşkler list in a
  browser" is proven up to the mocked reads, not end to end.
- The Playwright specs of nizam and nazir were not run; real Keycloak was not reachable.
- The whole tedrisat suite, `typecheck`, `build` and `module-boundaries` through Nx were not run here (the
  integrator's gate); `eslint` ran without the Nx project graph, so the boundary rule was skipped.
