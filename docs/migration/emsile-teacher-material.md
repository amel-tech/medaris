# Emsile: the müderris's own material for a course

Five pieces of work on one branch (`feat/emsile-sarf-engine`), so that a müderris teaching the Emsile no longer has to prepare a lesson in an outside drawing tool. Every number below was read off command output on 2026-11-24; what could not be verified is listed as such at the end.

## What was added

| # | Piece | nazar-web | tedris-web | tedrisat |
| --- | --- | --- | --- | --- |
| 1 | `@medaris/sarf`, the sarf engine | — | — | — |
| 2 | Sarf tablosu | `/ders/[dersId]/sarf` | "Sarf" tab of the course page | `course_sarf_roots` |
| 3 | Ders tahtası | `/ders/[dersId]/celseler/[celseId]/tahta` | session page, read-only | `lesson_boards`, `lesson_board_files` |
| 4 | Lügat | `/ders/[dersId]/lugat` | "Lügat" tab of the course page | `course_terms` |
| 5 | Ders notu | `/ders/[dersId]/celseler/[celseId]/not` | session page, above the board | `lesson_teacher_notes` |

`libs/sarf` is `scope:shared` and carries no `platform:*` tag, so both web apps import it. It takes a three-letter sâlim root and a bâb and gives the 24 sîgas of the Emsile-i Muhtelife with every çekim.

All five tables are made by one migration, `0081_emsile_teacher_material.sql`, with one hand-written rollback in `src/database/rollbacks/`. The branch was cut at `a0248bb4` and first carried them as 0069 to 0072; `main` took those four numbers for other work in the meantime, so when `main` was merged in the four were replaced by one generated on top of `main`'s 0080. Nothing had applied the old four outside a developer's machine.

Each table hangs off a course or a lesson with `ON DELETE RESTRICT`, so every purge that deletes a course, a week or a session names it: `purgeCourses` and `deleteSession` in `src/course/course-purge.ts`, and the two purge branches of `src/archive/archive.repository.ts`.

## Measured

- `apps/tedrisat`, whole suite, after `main` (`0ee675e3`) was merged in: 238 files, 3957 tests, all passing, inside `nx run-many -t test`. Before the merge, on the branch alone: 217 files, 3777 tests, all passing (`pnpm exec vitest run`, 192 s). The new e2e specs in it: `course-sarf` 8 tests, `lesson-board` 11, `course-term` 8, `lesson-teacher-note` 10.
- `libs/sarf`: 5 files, 145 tests. `libs/utils`: 8 files, 133 tests.
- The gate after the merge, each target run on its own with `--skip-nx-cache`, as Nx counted its tasks: `typecheck` 21, `build` 17, `lint` 19, `module-boundaries` 19, and `test` over 15 projects, all green.
- `pnpm assert:openapi-fresh`: 265 paths, identical to what the exporter writes. `node tools/ci/assert-release-config.mjs`: 7 components, chain intact.
- The route inventory snapshot (`test/e2e/__snapshots__/authz-route-inventory.txt`) is 13 lines longer than `main`'s.
- `pnpm run security-check`: no high or critical advisory brought in. The lesson board's canvas first brought seven, all high and all through `@excalidraw/excalidraw`'s exact declarations of `nanoid` (3.3.3 and, through `mermaid-to-excalidraw`, 4.0.2) and its `lodash-es` 4.17.21. Three overrides in `pnpm-workspace.yaml` close them, with their removal condition written beside them. nazar-web and tedris-web were built and tested again after the overrides; the canvas itself was not opened in a browser.

Two runs of the gate did not pass on the first attempt, neither for a reason in this branch:

- `keycloak-theme:test` timed out once in `test/deploy.spec.ts` (a 5000 ms default on a test that drives a shell script) while fifteen projects' tests ran at once; alone it passed, 9 files and 638 tests, and the next full `-t test` run passed.
- `next build` stopped once in all four web apps with `SecurityFatalError: Your version of Next.js is affected by a known security vulnerability`. The same command passed when run again. The catalog pins `next: ~16.4.2`; the upgrade is not part of this branch.

## The tedrisat suite failed at random on macOS, and why

Before this branch's fix the whole tedrisat suite failed in a few unrelated e2e tests every run, each one as "the row just inserted is not found" (`expected 200 "OK", got 404 "Not Found"`), and each passed when run alone.

It is not a regression of this branch. On a clean copy of `main` at `a0248bb4`:

- whole suite: 2 of 3740 tests failed (213 files);
- e2e suites only: 7 of 2468 tests failed (119 files).

The cause is in how supertest reaches the app. Handed a server that is not listening, it calls `listen(0)` for each request, which binds the wildcard address, and then dials `127.0.0.1:<port>`. macOS hands a wildcard bind a port number that another process already holds on `127.0.0.1` alone, and the more specific socket takes the connection. The request is then answered by that other process.

This was measured, not inferred: for the second run above every test app stamped its answers with a header naming its worker process, and every unexpected 404 was logged with its URL. All 5 logged answers had no such header and an empty body, and each of their ports (49430, 51370, 55890, 57496, 60317) was a port a local developer tool was listening on, per `lsof -nP -iTCP -sTCP:LISTEN`. The other 2 failures of that run were not logged by the probe and were not looked into.

The fix is in `test/helpers/test-app.helper.ts`: `createTestApp` listens on `127.0.0.1` itself, so supertest reuses that address and nothing else can answer for it. `test/unit/jwt-claim-validation.spec.ts` builds its own app and does the same. No assertion was changed. After it, the whole suite passed twice in a row on the branch (once alone, once inside `nx run-many -t test`).

## Not verified

- **In a browser.** The pages were not opened by a person or an agent. The only browser the session could drive was on another machine and could not reach this one's `localhost`. What stands in for it: the e2e specs above, a DOM spec of the note editor (`apps/nazar/test/teacher-note-editor.spec.tsx`, 6 tests), and the unauthenticated request to each new nazar-web route answering with the redirect to sign-in.
- **Image upload against real storage.** The board's images go to Bunny; the e2e spec uses an in-memory store. No request was made to a real storage zone.
- **Linux and CI.** Whether the port collision can happen on Linux was not measured. Every observation above is from one macOS machine.
- **How often the suite failed on this branch before the fix** was reported as five to seven tests a run by the session that wrote the first four pieces; that count was not re-measured here.

## Follow-ups

1. Roots that are not sâlim (illetli, hemzeli, muzaaf) and the mezîd bâbs (Binâ, Maksûd): the engine covers the sülâsî mücerred sâlim only.
2. Word-by-word tahlil over an âyet (PRD M11, hâşiye).
3. Excalidraw loads its fonts from its default CDN; they should be served from our own origin.
4. Excalidraw has no Arabic font of its own; Arabic text on the board falls back to the browser's.
5. The new write endpoints (sarf roots, board, glossary, lesson note) write no `audit_log` row.
