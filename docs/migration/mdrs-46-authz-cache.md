# MDRS-46 - The authz resolver cache: work package 1, the measurement

Stacked on MDRS-135 (#177) and MDRS-205 (#197), tip `4e039281`. **This does not close MDRS-46.** The issue
says "measure first ... and report queries-per-request" before anything is cached; this is that, and only
that. It adds a statement counter and a measurement spec, both new files, and changes no source. The cache,
its invalidation and the migration it needs (work packages 2 to 4 of the scout's dossier) are not built.
Every number below sits next to the command that printed it; commands run from `apps/tedrisat`.

## What changed

| File | What |
| --- | --- |
| `test/helpers/statement-counter.ts` | `recordStatements(run)` counts the SQL statements sent while `run` is awaited, by spying `pg`'s `Client.prototype.query`. `describeStatement` and `summariseStatements` name them in a few words; a statement is named after the first table at its own level, never a subquery's (the köşk read has the holders of the köşk as subqueries in its select list). |
| `test/unit/helpers/statement-counter.spec.ts` | 6 tests on the naming, including a select with a subquery in its select list and a string literal holding parentheses. |
| `test/e2e/authz-query-count.e2e.spec.ts` | Two specs pin that the counter is trustworthy; nine scenarios send 1 first request and 50 more of one route on one dataset, assert each answers 200 and costs the same number of statements every time, and print the table below. |

`Client.prototype.query` is the one method every path ends in: `Pool.query` checks a client out and calls
it, and a drizzle transaction sends `begin`, its statements and `commit` through it. Spying
`Pool.prototype.query` as well counts a pool statement twice (red check R1 below). The counter sees what
leaves the process, so nothing in the code under measurement was touched or instrumented.

## Behaviour changes

None. No route, DTO, copy, migration or source file changes; the route inventory and the OpenAPI spec are
not regenerated (nothing they describe moved).

## The dataset

One köşk with a köşk nazımı, one medrese with a başmüderris, **30 published courses of that köşk, all of
them the medrese's**, one talebe **enrolled in 10 of them**, one signed-in outsider with no role, no
enrollment and no grant, and two decks of one author (one private, one public). The roles are the
`role_assignments` rows `assignRole` writes; there are no grants and no platform policies, so each grant
and policy read is the empty case. The throttler limit is raised for the file (`THROTTLE_LIMIT`), because
50 runs of one route is past its 100 a minute; it is not what is measured.

## What one request costs today

```
$ ./node_modules/.bin/vitest run test/e2e/authz-query-count.e2e.spec.ts
 Test Files  1 passed (1)
      Tests  11 passed (11)
```

The spec's own table (`first` is the first request of that caller and route, `per request` the count of
every one of the 50 runs after it; the spec fails if two runs differ):

| request | first | per request | median ms | p95 ms |
| --- | --- | --- | --- | --- |
| GET /kosks/:koskId/courses, enrolled talebe | 12 | 11 | 27.6 | 44.3 |
| GET /kosks/:koskId/courses, köşk nazımı | 12 | 11 | 23.2 | 27.2 |
| GET /kosks/:koskId/courses, signed-in outsider | 12 | 11 | 22.9 | 25.8 |
| GET /madrasahs/:id/courses, başmüderris | 12 | 11 | 15.1 | 17.7 |
| GET /courses/:id, enrolled talebe | 20 | 20 | 31.4 | 38.0 |
| GET /courses/:id, signed-in outsider | 17 | 17 | 26.7 | 40.5 |
| GET /courses/:id, köşk nazımı | 18 | 18 | 29.6 | 39.4 |
| GET /flashcard/decks/:id, the author's private deck | 6 | 5 | 10.4 | 13.2 |
| GET /flashcard/decks/:id, a public deck, signed-in outsider | 5 | 5 | 11.3 | 15.1 |

The statement counts were identical in the three runs made (the first run, a run that also dumped the SQL,
and the one above). The milliseconds were not, and are one machine with Postgres in a local container:
read them as an order of magnitude, never as a budget, and not as a comparison with a later run on another
machine. The first-request `+1` is one statement, `insert users` (the user row's sync, which a caller pays
once per process; `UserSyncService`), on every row where it shows.

### Where the statements go

Read off the SQL text of one run of each scenario (a temporary dump of every statement, not committed; the
committed spec prints the grouped summary under its table, which is what to compare against later; for
the köşk list it prints `select role_assignments x4, select kosks x3, select courses, select madrasahs,
select permission_grants, select platform_policies`, which is the 3 köşk reads and 4 role reads of the
table below). A
decision is the relation lookup of the route's module plus the loader's statements, as the dossier counted
them; the rest is what the handler reads for its own answer.

| request | authorization | the handler's own reads | total |
| --- | --- | --- | --- |
| GET /kosks/:koskId/courses | 6 (köşk exists, köşk row, roles, grants, managers, platform policies) | 5 (the köşk again, "is the viewer a manager", the 30 courses, their medrese, their imams) | 11 |
| GET /madrasahs/:id/courses | 6 (medrese exists, its row and settings, roles, grants, managers, policies) | 5 (the medrese exists again, the courses, their müderris, imams, enrollment counts) | 11 |
| GET /courses/:id, enrolled talebe | 16 = 2 x 8 (course's köşk, enrollment, ban, facts, roles, grants, managers, policies) | 4 (the course, its medrese, imams, "is the viewer a manager") | 20 |
| GET /courses/:id, outsider | 14 = 2 x 7 (the same without the ban read) | 3 | 17 |
| GET /courses/:id, köşk nazımı | 14 = 2 x 7 | 4 (the same three, and one `insert audit_log`, the content-read audit, `course.content_read`) | 18 |
| GET /flashcard/decks/:id | 4 (deck visibility, roles, grants, policies; no facts or managers for a deck) | 1 (the deck) | 5 |

So 80 percent of a deck's, 55 percent of a list's and 78 to 82 percent of a course page's statements are
the authorization decision, and the course page pays it twice (the guard, then
`CourseService.present`'s own `course.view_details`). This agrees with the dossier's per-decision table
(deck 4, köşk 6, medrese 6 with `byExistingMadrasah`, course 7 or 8) and its "14 to 16" for the course
page; nothing in the dossier's counts was wrong. (The percentages are statements, not time.)

What this does not show: the two lists return 30 rows for 11 statements, and the statements of the list
are batch reads (`in (...)` over the 30 ids), so a list is not N+1 in this tree. That is read from the
SQL of the 30-row dataset; the spec does not vary the row count, so it does not prove the count is
independent of it.

## What the numbers say about the cache

The decision is a fixed price per request: 4 to 8 statements, 14 to 16 on the course page, on this dataset
(the loader's bound on larger ones is pinned by its unit spec, see "Not verified"). A cache in front of the loader (its 5 statements of a köşk's 6, of a course's 7 or 8, and 3 of a deck's
4) would leave the relation lookup, which is deliberately not cached, and the handler's reads. That is
the scout's expectation of 1 to 2 statements for a warm decision plus the relation lookup, and these are
the "before" numbers it is to be compared against. Work packages 2 to 4, and MDRS-47 (which changes the
loader's inputs), re-run this spec for the "after" and update this table.

## Decided by default, owner may overrule

1. **The spec prints the counts and does not pin them.** A count pinned here would turn every later
   change to a list query, or to the loader's inputs (MDRS-47, MDRS-136), into a red test that is not
   about authorization, and the table is read by a person. What the spec does assert is that a measurement
   can be trusted: the counter counts a pool statement and a transaction exactly, counts nothing for a
   request that never reaches the database, every measured request answers 200 (a refusal costs a
   different number of statements, so it would be another route), and every run of one route costs the same.
   If the owner wants a hard budget (for example "the course page may not exceed 20"), it is one line per
   scenario. A review mutated the code under measurement (an extra `platformPolicies()` in the loader, the
   second `course.view_details` decision of `CourseService.present` replaced by `true`) and the course page
   scenario stayed green with its cost falling from 20 to 13: so the "before" numbers are a printed table
   that a person compares, not an assertion. The scenario names therefore claim no number of decisions;
   that the course page decides twice is read from the SQL, as the table above says.
2. **The first request is reported apart.** The sync of the user row would otherwise make the first run
   differ from the 50 that follow it.
3. **Latency is printed, never asserted.** It depends on the machine.
4. **Dossier D1 to D5 are not decided here.** They concern the cache, which this does not build.

## Tests, and that they fail

`statement-counter.spec.ts` (unit, 6 tests) pins how a statement is named. Red then green: with the
first-`from` regex of the first commit of this branch put back, 3 of its 6 fail (`expected
'select role_assignments' to be 'select kosks'` for a select with a subquery in its list, the same for the
string-literal case, and `expected 'select role_assignments x3' to be 'select kosks x2, select
role_assignments'` for the summary); with the fix, 6 pass. Before it, the printed köşk-list summary was
`select role_assignments x5, select kosks x2`; after it, `x4` and `x3`, and the totals (11 and 12) did not
move.

`authz-query-count.e2e.spec.ts`, 11 tests: 2 on the counter, 9 scenarios (each 1 + 50 requests). Each was
run with one change put in and then reverted (the file compared with the copy taken before, identical),
against the whole file or its `-t` selection:

| Change put in | Result |
| --- | --- |
| R1: `statement-counter.ts` also spies `Pool.prototype.query` (a pool statement counted twice) | "counts a statement once ..." fails: `expected [ 'select 1', 'select 1' ] to deeply equal [ 'select 1' ]` |
| R2: the spy is never restored | the same test fails: `RangeError: Maximum call stack size exceeded` in `begin` (a second spy wraps the first) |
| R3: the counter records nothing | the same test fails: `expected [] to deeply equal [ 'select 1' ]` |
| R4: the "no database" request is a real route (`GET /kosks/:id/courses`) | "sees nothing for a request that never reaches the database" fails: `expected [ ...(12) ] to deeply equal []` |
| R5: the deck scenario asks for a deck that does not exist | that scenario fails: `expected 404 to be 200` |
| R6: the runs of a scenario alternate between two callers | the course page scenario fails: `expected 3 to be 1` (the number of distinct counts) |

A scenario's counts are not asserted against numbers, so there is no test that "the count is 11": the
numbers above are the output of the harness, and the harness is what is tested.

## Not verified

- The numbers are one dataset, one machine, one Postgres 17 container and the stubbed key provider. A
  real deployment adds network latency to every statement, which is the point of a cache and is not
  measured here.
- Concurrency: the counter assumes one request at a time (the window is the process). Nothing here says
  what N simultaneous requests cost.
- The count does not vary with the number of rows, the number of grants held or the number of roles held;
  the dataset has no grants and one role per person. The loader's own bound on that (5 statements however
  many scopes, grants or groups) is pinned by `test/unit/authz/tedrisat-authz-context.spec.ts`, not here.
- Routes other than these four: the ban, enrollment, audit and write routes are not measured.
- The whole tedrisat suite was not run (the integrator does); only this spec (3 times before the naming fix, once after, counts identical), the unit spec of the naming, and the red checks.
