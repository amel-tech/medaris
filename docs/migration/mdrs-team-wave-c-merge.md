# Team wave C — merging MDRS-43 onto MDRS-134

`argedikas/medaris-team-wave-c` = `argedikas/medaris-team-wave-b` (PR #99,
MDRS-78 launch wave 1, plus MDRS-134 role assignments, at `4f53cafd`) with
`argedikas/medaris-ongoing` (PR #101, MDRS-43 authorization holes, at
`8209415e`) merged into it (`--no-ff`).

The rule for every resolution: MDRS-43's authorization checks stay in force
and no authorization assertion is weakened; MDRS-134's data model decides
where roles come from (`role_assignments`, not `kosks.owner_id`,
`kosk_managers`, `madrasah_nazirs` or `kosks.madrasah_id`).

## Migrations

PR #101 adds no migration, so nothing was renumbered. The journal ends at
MDRS-134's `0024_drop_superseded_role_tables`.

## Conflicts and what was kept

| File | MDRS-43 wanted | MDRS-134 / #99 wanted | Kept | Proven by |
| -- | -- | -- | -- | -- |
| `apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts` | a missing köşk is a 404 (`KoskNotFoundError`), not PUBLIC; told apart from "not yours" with `KoskService.findOwnerId` | many managers per köşk, read as KOSK_NAZIM through `KoskService.isManager`; a missing köşk answered PUBLIC | both: `exists` and `isManager` in parallel; no köşk → `KoskNotFoundError`, manager → KOSK_MANAGER, else PUBLIC. There is no single owner column to read any more, so `findOwnerId` could not survive | `test/unit/authz/tedrisat-role-resolver.spec.ts` ("404s when the köşk does not exist, rather than denying"; "returns PUBLIC for non-UUID köşk ids" now also asserts `exists` is not called); `test/e2e/kosk.e2e.spec.ts` ("returns 404 when following a missing köşk", "returns 404 for a missing köşk") |
| `apps/tedrisat/src/kosk/kosk.service.ts` | add `findOwnerId`, keep `isOwner` | `isOwner` replaced by `isManager` (KOSK_NAZIM) | MDRS-134's side; `findOwnerId`/`isOwner` dropped (the repository no longer has `findOwnerId`), the resolver uses the existing `exists` | typecheck; the resolver tests above |
| `apps/tedrisat/src/kosk/kosk.controller.ts` | class-level `@UseGuards(AuthGuard, AuthzGuard)`; `@Authz` with `byParam(KOSK)` on every `:id` route; `@AuthzExempt` on list, create, unfollow | method-level `@UseGuards(AuthzGuard)` and `@Authz(…, byExistingKosk)` on update, delete and the two manager routes | class-level guard (MDRS-43). On update/delete the auto-merge had stacked BOTH decorators and the guard twice; one `@Authz` per route kept, with MDRS-134/#99's `byExistingKosk` (same scope, and a malformed id stays 404 on a write route instead of 403). Method-level `@UseGuards(AuthzGuard)` removed as redundant. Read/follow routes keep MDRS-43's `byParam` | `kosk.e2e.spec.ts` ("answers 404 to a DELETE of a köşk that does not exist", "forbids a non-owner from editing or deleting a köşk"); `kosk-managers.e2e.spec.ts` ("answers 404 for a köşk that does not exist"); `hide-instead-of-delete.e2e.spec.ts:126` (403 to a köşk manager on DELETE) |
| `apps/tedrisat/src/course/course.controller.ts` | class-level `AuthzGuard`; `@Authz(EDIT, byParam(COURSE))` on PUT, `@Authz(DELETE, byParam(COURSE))` on DELETE | `@ApiConflictResponse` (COURSE_VERSION_CONFLICT) on PUT; method-level guard + `@Authz(…, byExistingCourse)` on archive, restore, delete | PUT carries both. Delete had both `@Authz` decorators stacked: kept `byExistingCourse` (same `DELETE` scope). Archive/restore keep `byExistingCourse`; method-level `@UseGuards(AuthzGuard)` removed as redundant with the class-level guard | `hide-instead-of-delete.e2e.spec.ts:126,148,155`; `course.e2e.spec.ts` ("forbids course mutations on a köşk owned by someone else") |
| `apps/tedrisat/test/e2e/course.e2e.spec.ts` | MDRS-43 AC-6 müderris test: a müderris who does not manage the köşk gets 403 on PATCH though the matrix grants EDIT; müderris made by a `course_muderris.userId` row | imports `courseWeeks`, `enrollments`, `lessons`; roles from `role_assignments` | imports unioned. The test is adapted to the data model only: the köşk gets its KOSK_NAZIM row (as every other #99/134 test does) and the müderris a `role_assignments` MUDERRIS row next to the `course_muderris` row. It additionally asserts that the resolver answers MUDERRIS for that caller, so the 403 is proven to come from the service's inner fence. The 403 and "title did not move" assertions are unchanged | that test, `course.e2e.spec.ts:855` (the resolver is fetched by its `ROLE_RESOLVER` token) |
| `apps/tedrisat/test/e2e/flashcard-bulk.e2e.spec.ts` | new "keeps every owner scope on the owner's own PUBLIC deck" test; the comment on the 404 test rewritten for AC-4 (private deck = 404) | only reworded the old comment (`assertOwner` → `assertManager`) | MDRS-43's side entirely: its comment supersedes the "404 vs 403 split" text #99 had reworded | the two tests in that hunk |
| `apps/tedrisat/test/unit/authz/tedrisat-role-resolver.spec.ts` | 404 tests for missing deck/köşk/course; `findOwnerId` stub | `isManager` stub, medrese nazır gets nothing on a köşk or course | both: stubs are `exists` (new `koskExists`, default true) and `isManager`; every MDRS-43 404 test and every MDRS-134 "nazır gets PUBLIC" test kept | the spec itself |
| `libs/i18n/src/locales/{tr,en,ar}/tedris.json` | `DeckUnavailable` block | `SessionTime`, `AddToCalendar`, `CalendarSubscription`, `Auth`, `WelcomePage` blocks | all of them; checked that every key and value of both parents is present and unchanged | parse + key comparison against both parents |

Auto-merged but checked: `libs/services/swagger-docs/tedrisat.json` —
`node tools/ci/assert-openapi-spec-fresh.mjs` reports the spec identical to
what the exporter writes from the merged controllers (50 paths).

## Cost noted, not changed

A write route on a köşk now asks "does it exist" twice (`byExistingKosk`, then
the resolver) plus `isManager`, all small indexed reads. Collapsing them is
left to MDRS-135, which replaces the resolver with the permission engine.
