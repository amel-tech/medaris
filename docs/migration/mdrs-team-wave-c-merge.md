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

## Authorization parity: every tedrisat route on both sides

Every `*.controller.ts` under `apps/tedrisat/src` was read at three commits:
PR #101 (`8209415e`), wave B (`4f53cafd`) and the merge (`5eaa2581`). For each
route (method + path) the script recorded the class-level and method-level
`@UseGuards` and every `@Authz`/`@AuthzExempt`. The script and its output are
kept in the job's tmp directory (`wavec-authz-inventory.py` and `.txt`). The
number of `@Get/@Post/@Put/@Patch/@Delete` decorators found by `grep` matches
the number of routes parsed on every commit: 51, 74, 74.

- **#101 → merge:** all 51 of #101's routes are present. 48 are identical:
  same guard, same `@Authz` scope and resolver, or the same `@AuthzExempt`.
  The other 3 keep the same guard, entity and scope, and change only the
  resolver from `byParam` to wave B's `byExisting…`: `PATCH /kosks/:id`
  (`EDIT`), `DELETE /kosks/:id` (`DELETE`) and `DELETE /courses/:id`
  (`DELETE`). `byExisting…` adds a 404 for a missing or malformed id in
  front of the same scope check, so it only adds a check.
- **Wave B → merge:** all 74 routes are present. The 23 routes #101 does not
  have (madrasah, calendar feed, me, users, the köşk manager routes, course
  archive/restore) are identical. Of the 51 shared routes, the merge adds
  #101's guard and `@Authz`/`@AuthzExempt` to 36. None of these routes had an
  `@Authz` on wave B, so they have gone from none to one.
- **Findings:** no route lost a guard or a scope compared with either
  parent, and no route has more than one `@Authz`. 18 routes have no
  `AuthzGuard` in the merge: health and root, the calendar feed, the label
  controllers, `me` and `users`. They have none on either parent, and neither
  PR moved them.

## Red proofs

No `git stash` was used. Each implementation file was copied to the job's tmp
directory (`wavec-*.ts`), then the one piece named below was reverted, the
test was run under the test lock, and the file was copied back. After that
the resolver spec was green (24/24) and `course.e2e.spec.ts` was green (45/45).

| Test | What was reverted | Result |
| -- | -- | -- |
| `course.e2e.spec.ts:855`, müderris refused (adapted) | the `assertCourseOwner` call in `CourseService.update` | red: `expected 403 "Forbidden", got 200 "OK"` |
| same test | `CourseRepository.isMuderris` made to answer `false` (the resolver no longer sees the `role_assignments` MUDERRIS row) | red: `expected 'PUBLIC' to be 'MUDERRIS'` |
| `tedrisat-role-resolver.spec.ts`, whole file | the resolver replaced with wave B's version (`4f53cafd`) | red: 4 of 24 fail — the 404 tests for a stranger's private deck, a missing deck, köşk and course |
| same file | the resolver replaced with #101's version (`findOwnerId`/`isOwner`) | red: 13 of 24 fail. These are every köşk and course test that reaches the köşk lookup, plus the medrese test, because #101 has no medrese branch |
| `tedrisat-role-resolver.spec.ts:177`, missing köşk → 404 | only the `if (!exists) throw new KoskNotFoundError(…)` line removed | red: 1 of 24 fails (`resolved 'PUBLIC' instead of rejecting`) |
| `course.e2e.spec.ts:128`, course create under a missing köşk → 404 | the same line removed | red: `expected 404 "Not Found", got 403 "Forbidden"` |

The same one-line revert left the 404 tests in `kosk.e2e.spec.ts` green. Those
routes do not depend on the resolver's 404: `GET` and `follow` pass the guard
through PUBLIC's `VIEW` and then 404 in the service, and `PATCH`/`DELETE`
404 in `byExistingKosk`. The resolver's köşk 404 only matters on
`byParam(KOSK)` routes whose scope PUBLIC does not hold, and the course-create
row above covers exactly that case.

## Review (code-review skill, medium, on the conflict resolutions)

0 findings. The reviewer found that no route lost authorization. It also
confirmed that `byExisting…` is the right choice on the write routes, and
that the `exists` + `isManager` pair keeps "no köşk" (404) apart from "not
yours" (403). It noticed uncommitted edits to `course.service.ts` and
`course.repository.ts` in the worktree. Those were the red-proof reverts
above, running at the same time as the review. Both files were restored
before anything was committed, and the tree was clean.

## Cost noted, not changed

A write route on a köşk now asks "does it exist" twice (`byExistingKosk`, then
the resolver) plus `isManager`, all small indexed reads. Collapsing them is
left to MDRS-135, which replaces the resolver with the permission engine.
