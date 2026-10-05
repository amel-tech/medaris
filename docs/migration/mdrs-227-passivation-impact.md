# MDRS-227 — Passivating a köşk or medrese shows what it takes with it and asks for confirmation

Stacked on MDRS-136 / MDRS-143 (`taha/mdrs-136-open-scopes-with-their-admins`, tip `377d4b6e`). The owner
answered d-1003-08 on 4 October: a passive köşk or medrese keeps closing every course below it, courses
with a live müderris and enrolled talebe included, and **"Bunları pasife alırken yanında neleri
götürdüğünü uyarıyla göstersin, onaylanırsa devam edilsin."** This builds that: the act of passivating
first shows the impact, and the call refuses until the caller confirms that exact impact. The engine is
not touched (it already closes the descendants); no migration. Every number below sits next to the command
that printed it; commands run from `apps/tedrisat` or `apps/nizam` as written.

## What changed

| Route | Was | Is |
| --- | --- | --- |
| `GET /kosks/:id/deactivation-preview` (`getKoskDeactivationPreview`) | none | `platform.kosk_edit` on `byExistingKosk`; the impact and a `confirmation` |
| `POST /kosks/:id/deactivate` (`deactivateKosk`) | `@AuthzExempt`, `requirePlatform(platform.kosk_edit)` in the service, no body | `platform.kosk_edit` on `byExistingKosk`; body `{ confirmation }`; 400 without it, 409 `PASSIVATION_IMPACT_CHANGED` when stale |
| `GET /madrasahs/:id/deactivation-preview` (`getMadrasahDeactivationPreview`) | none | `platform.madrasah_edit` on `byExistingMadrasah` |
| `POST /madrasahs/:id/deactivate` (`deactivateMadrasah`) | **none: a medrese could not be made passive** | `platform.madrasah_edit` on `byExistingMadrasah`; same body and refusals; 409 `MADRASAH_ALREADY_PASSIVE` |

No new catalogue code, `libs/common` is untouched.

### The preview

`apps/tedrisat/src/passivation/`: `PassivationImpactRepository.measure(scope, exec, now)` reads, for the
scope, every course below it that is not hidden (a köşk's includes the courses of medreses it hosts, a
medrese's includes its courses in every köşk, because the engine closes both through the chain course,
medrese, köşk), and for each: whether someone holds the MUDERRIS role now, the ENROLLED and the COMPLETED
count. Then the distinct talebe over all of them (a talebe in two courses counts once), the LIVE sessions
of the next `windowDays = 7` days, the people who hold the manager role now (KOSK_NAZIM, or
MEDRESE_BASMUDERRIS) and `closesContent`: the scope had a manager once, held or not, which is exactly the
engine's test for "passive, not new" (`TedrisatAuthzContext.managerStats`). "Held" is `holdsIn`, the helper
`revokeRole` and the engine use, so the people counted as leaving are the people revoked.

A session counts when it is `LIVE`, not cancelled, its lesson, week and course are not hidden, its course
is PUBLISHED (a draft's sessions never reach a talebe) and it starts inside the window. Courses without a
live müderris are closed already: they count under `courses.total` and not under `withLiveMuderris`. That
difference is what the owner asked to see, and `students` is therefore an upper bound of who loses access
today; the screen says so.

Response: `scope`, `alreadyPassive`, `closesContent`, `staffLeaving` (a count), `courses {total, published,
draft, withLiveMuderris, items (first 50, most enrolled first), truncated}`, `students {enrolled,
completed}`, `sessions {windowDays, count, next (first 5)}`, `confirmation`. The preview of a passive scope
answers 200 with `alreadyPassive: true`; the POST answers 409.

### The confirmation token

`confirmationOf(impact, actorId)` is the SHA-256 hex of a canonical JSON: version, scope type and id, the
actor, `closesContent`, the staff ids sorted, the courses as `[id, status, liveMuderris, enrolled,
completed]` sorted by id, the distinct talebe counts, the window and the session ids sorted. Only ids and
counts: no name, no timestamp, so the same facts always give the same token and any change in them gives
another. It is bound to the person it was made for. It is a change detector, not a secret: whoever may
preview may confirm (tedrisat has no shared server secret to sign with), and the server never trusts the
posted token: the call measures the impact again inside its transaction, under the scope's row lock
(`for no key update`, as `hide` and `setHeadMuderris` do), and compares with `timingSafeEqual` on equal
length buffers (`confirmationMatches`; a short, long or empty string is a no, never a throw).

A mismatch throws `PassivationImpactChangedError` (409, `PASSIVATION_IMPACT_CHANGED`) with the fresh
preview in `context.impact`, written nothing. Then the call does what `KoskAdminRepository.deactivate`
already did: revoke the held manager rows (`revokeRole`), set `passive_since` and
`passive_reason = DEACTIVATED_BY_ADMIN`, and write the audit row. For a medrese the manager role is
MEDRESE_BASMUDERRIS; the medrese's nazırlar and every grant stay, as the köşk's other roles do today.

### The audit row

`kosk.deactivate` (as before) and the new `madrasah.deactivate` (entity `madrasah`, which the audit page's
scope resolution already reads) carry `details`: `name`, `removedNazimIds` (köşk) or `removedHeadIds`
(medrese), `impact {courses, withLiveMuderris, enrolled, completed, closesContent, sessions {windowDays,
count}, courseIds}` and the `confirmation` the person posted. `audit_log.details` is jsonb, so no migration.

### nizam

One `PassivateScopeDialog` (`apps/nizam/features/passivation`) replaces `DeactivateKoskDialog` (deleted).
On opening it calls the preview and shows a warning: who leaves the post, how many courses close
(published / draft) and how many of them have a müderris, how many enrolled talebe (and finished), the live
sessions of the next days and the first of them, the first courses by name with "ve N ders daha", and the
way back. "Vazgeç" has the focus; the scrim does not close it; the button reads "Yine de pasife al" and is
shut while loading, after a failed read, while saving and for a scope that is passive already. On 409
`PASSIVATION_IMPACT_CHANGED` the shown numbers are replaced by `errorBody.context.impact`, the screen says
the numbers changed, and nothing is retried by itself: the button works again for the fresh token. A scope
that never had a manager shows "Bu kapsamın hiç yöneticisi olmadı; pasife almak içeriği kapatmaz." instead
of a list of courses that would not close. The köşk page uses it as before, the Medreseler table gets a
"Pasife al" button on every ACTIVE row, next to "Başmüderrisi değiştir". Pure helpers (`present.ts`:
`impactLines`, `canConfirm`, `passivationErrorKey`, `changedImpact`, `hiddenCourseCount`) are unit-tested;
nizam's specs render to static markup and there is no testing-library, so the dialog's own interaction is
not unit-tested (see "Not verified"). nazım and nazır are kept apart in every sentence: the köşk has a
nazım, the medrese a başmüderris and nazırlar.

## Behaviour changes callers will see

- `POST /kosks/:id/deactivate` now **requires a body** `{ "confirmation": <64 hex> }`: 400 without it. The
  only client is nizam, updated here; no tedris, nazir or other code calls it.
- The same route answers **409 `PASSIVATION_IMPACT_CHANGED`** when anything in the preview changed or the
  token was made for someone else; the body's `context.impact` is the fresh preview.
- Its **decision moves from `exempt` to `platform.kosk_edit on byExistingKosk`**. The same people pass (the
  exempt path asked the engine for the same code in `requirePlatform`: the başnazım, and a Medaris nazımı
  holding `platform.kosk_edit`); the köşk nazımı still gets 403. An unknown id is 404 from the guard now,
  before body validation. The stale "SYSTEM_ADMIN only" summary is corrected.
- **New routes**: the two previews and `POST /madrasahs/:id/deactivate`. The medrese could not be made
  passive before. The başmüderris cannot passivate their own medrese (403), nor a medrese nazırı.
- The `kosk.deactivate` audit row has two more fields (`impact`, `confirmation`); old rows are unchanged.
- nizam: the köşk's confirm dialog is new (more text, "Yine de pasife al"), and an ACTIVE medrese row has a
  second button (an ACTIVE row without a başmüderris shows only "Pasife al").
- Route inventory, the diff read line by line, nothing else moved:
  `GET /kosks/:id/deactivation-preview -> platform.kosk_edit on byExistingKosk` (new),
  `GET /madrasahs/:id/deactivation-preview -> platform.madrasah_edit on byExistingMadrasah` (new),
  `POST /madrasahs/:id/deactivate -> platform.madrasah_edit on byExistingMadrasah` (new),
  `POST /kosks/:id/deactivate -> exempt` became `platform.kosk_edit on byExistingKosk`.

## Decided by the owner

1. **A passive scope closes everything below it, and passivating must show what it takes and continue only
   on confirmation** (d-1003-08, 4 October). This is the issue.
2. **A medrese gets a passivate action too** (d-1004-19, "evet"): `POST /madrasahs/:id/deactivate`, decided
   by `platform.madrasah_edit`, which revokes the başmüderris and sets `passive_since`, the mirror of the
   köşk's. The köşk route keeps `platform.kosk_edit`.

## Decided by default, owner may overrule

| # | Question | Default taken |
| --- | --- | --- |
| D2 | The issue says "nizam and nazir"; nobody in nazir can passivate anything (a başmüderris cannot passivate their own medrese) | nizam only, nazir unchanged. A nazir action would be a new permission decision, not this issue |
| D3 | How many days ahead are "the next days" | 7, a constant (`PASSIVATION_SESSION_WINDOW_DAYS`) returned as `sessions.windowDays`, so the screen never hard-codes it |
| D4 | A scope that never had a manager closes nothing when passivated (engine) | allowed, the preview says `closesContent: false` and the dialog says so; not refused. This is today's behaviour of `deactivate` |
| | A hidden scope | still passivatable and previewable, as today; the UI offers the button only for ACTIVE rows |
| | `staffLeaving` | a count, not a list of names: the screen needs the number, and the names would need a directory lookup in a read |
| | After a stale confirmation the button works again for the fresh token | the person has read the new numbers on the same screen; the planner's note said "false after a change", which would leave no way to confirm |
| | The token also covers each course's status and the distinct talebe counts | so a draft being published, which changes the shown "published / draft" and the session count, makes the token stale |
| | `docs/migration/mdrs-135-permission-catalogue.md` | **not edited** (the dossier asked to repoint "MDRS-227, not built" at this note): the hot-file rule gives that doc to MDRS-206 and 208 only. The three places to repoint are the "Closing the descendants is confirmed, the warning is not built" paragraph, the "What is NOT done" bullet and the "Decided by the owner" bullet |
| | `KNOWN` error maps of `kosks/admin-present.ts` and `madrasahs/present.ts` | not extended (the dossier listed them): the dialog maps its own refusals in `passivation/present.ts`; the new codes would be dead entries there |

## Edge cases, and what is accepted

- **Window drift.** `scheduled_at` is compared with the database clock, so a session that starts between
  preview and confirm leaves the window and the token goes stale: one 409, the screen re-shows.
- **Residual race.** A talebe enrolling after the in-transaction measure but before the commit is not
  caught. Inserting an enrolment takes `FOR KEY SHARE` on the course row, so locking the courses
  `FOR UPDATE` would close it at the price of blocking enrolments during an admin transaction. Not done.
- A talebe in the COMPLETED state loses content with the ENROLLED ones (the role resolver reads both as
  the ENROLLED relation); PENDING and REVOKED do not hold content and are not counted.
- Large scopes: `courses.items` is capped at 50 with `truncated`; the token covers every course.
- Case of ids: `measure` lower-cases the scope id as `TedrisatAuthzContext.load` does.
- A nazım whose term lapsed but was never revoked is not "leaving" (`isHeld` reads the database clock);
  `revokeRole` closes that row too, which is why the count and the revocation use the same helper.

## Tests, and each one failing with the change put back

```
$ cd apps/tedrisat && ./node_modules/.bin/vitest run test/unit/passivation
 Test Files  1 passed (1)
      Tests  25 passed (25)
$ cd apps/tedrisat && /home/taha/medaris-wt/.bin/e2e-slot.sh ./node_modules/.bin/vitest run test/e2e/scope-passivation.e2e.spec.ts
 Test Files  1 passed (1)
      Tests  23 passed (23)
$ cd apps/tedrisat && /home/taha/medaris-wt/.bin/e2e-slot.sh ./node_modules/.bin/vitest run test/e2e/kosk-overview.e2e.spec.ts
 Test Files  1 passed (1)
      Tests  17 passed (17)
$ cd apps/tedrisat && .../vitest run test/e2e/authz-route-inventory.e2e.spec.ts -u    # the diff above, nothing else
$ cd apps/tedrisat && .../vitest run test/e2e/madrasah-directory.e2e.spec.ts test/e2e/inactive-scope.e2e.spec.ts \
    test/e2e/madrasah.e2e.spec.ts test/e2e/kosk-admin.e2e.spec.ts test/unit/openapi-document.spec.ts test/unit/madrasah test/unit/kosk
 Test Files  14 passed (14)
      Tests  215 passed (215)
$ cd apps/nizam && ./node_modules/.bin/vitest run
 Test Files  41 passed (41)
      Tests  693 passed (693)
$ node tools/ci/assert-openapi-spec-fresh.mjs
✔ openapi spec freshness: 172 paths, identical to what the exporter writes today
$ node tools/ci/biome-ratchet.mjs      # errors 0, warnings 70 (baseline 70), infos 21 (baseline 21)
```

`scope-passivation.e2e.spec.ts` (the new file) and what each part proves, on the real routes and guard with
minted tokens: the köşk preview equals the database (4 courses, 3 published, 1 draft, 2 with a live
müderris, hidden course left out, a revoked müderris, S1 in two courses counted once, PENDING and REVOKED
not counted, one COMPLETED, 2 sessions: a cancelled one, one past the window, one already past, a VIDEO, a
hidden lesson, one in a hidden week and one in a draft course are left out); the medrese preview (2 courses
in two köşks, another medrese's course not counted); 400 and nothing written for a missing, short or
non-string confirmation; the token of the preview passivates and the audit row's `details.impact` and
`details.confirmation` equal the preview's; a stale token (a talebe enrols, a müderris leaves, a session is
scheduled, a nazım is added) is 409 with the fresh preview, different from the old token and equal to a
new preview, nothing written, and the fresh token then passes; a token made for one Medaris nazımı is
refused for another who may passivate too; `KOSK_ALREADY_PASSIVE` and `MADRASAH_ALREADY_PASSIVE`; a
never-attended köşk: `closesContent: false`, passivation allowed, the course below stays open; a köşk whose
only nazım was revoked: `closesContent: true`, `staffLeaving: 0`, not `alreadyPassive`; who may
(başnazım and a Medaris nazımı holding the code pass, the köşk's nazımı, the başmüderris, a medrese nazırı,
a Medaris nazımı with no grant or with the other code and a talebe get 403 on both preview and call, and
nothing was written); 404 for an unknown id and 401 without a token; the point of the issue: after the
confirmed call an enrolled talebe's `GET /courses/:id` answers `contentLocked: true` for a course of the
köşk and for a hosted medrese course (and for the medrese's courses in every köşk), the other köşk's course
stays open, `GET /nizam/inactive-scopes` lists the scope, and `POST /nizam/inactive-scopes/:type/:id/assign`
brings it back; for the medrese the başmüderris row is revoked in the actor's name, the nazır row and the
nazır's grant are untouched and the directory lists it under PASSIVE.

Red then green (the source change put back, the spec run, then restored; the `src` tree was diffed against a
copy to confirm the restore). Run against `scope-passivation.e2e.spec.ts`:

| Change put back | Failing tests |
| --- | --- |
| the confirmation is not compared (`confirmed` never throws) | the stale köşk token, the other-caller token, the stale medrese token (3) |
| the session predicate loses `cancelled_at is null` (alone) | the köşk preview: `sessions.count` 3, expected 2 |
| the session predicate loses its upper bound (alone) | the köşk preview: `sessions.count` 3, expected 2 |
| `closesContent` always true | the never-attended köşk preview |
| `closesContent` held-only (`ever_managed` read through `holdsIn`) | the köşk whose only nazım left: `closesContent` false, expected true (1 failed, 22 passed) |
| `POST /madrasahs/:id/deactivate` also takes `madrasah.hide` | the medrese permissions test (the başmüderris passes) |
| the köşk call revokes nobody | the passivate-with-token test and the "closes a course below" test |

Those 8 failing tests were one run with the six changes together (22 tests: 14 passed, 8 failed), and the
two session changes were then run alone. Not every query is mutated one by one (the enrolled, completed and
distinct-talebe counts, the hidden-course filter and the medrese's two-köşk reach are covered by the preview
equalities but were not each put back). `test/unit/passivation/passivation-impact.spec.ts`: with the actor
and the staff ids left out of the canonical JSON, 4 of 25 fail (a nazım added, the nazım leaves, another
caller, the foreign token). nizam: with `canConfirm` always true, the never-attended sentence removed,
`changedImpact` always null and the "Pasife al" button removed from the table, 4 tests fail across
`passivation.spec.ts` and `madrasahs.spec.tsx`; with one `ar` key removed, the parity test of
`PassivateScopeDialog` and the "sentence for every line" test fail.

## Criteria

| Criterion | Test |
| --- | --- |
| Preview for a köşk: courses, with a live müderris, enrolled talebe, live sessions in the next days | `scope-passivation.e2e.spec.ts` "counts what the database holds below the köşk" |
| Same for a medrese | "counts the medrese's courses in both köşks and not another medrese's" |
| The passivate call refuses until the exact impact is confirmed; a stale token is refused | the 400 tests, "refuses a token made before something changed…", "…another caller made…", and the medrese's stale test |
| A medrese passivate call exists | `POST /madrasahs/:id/deactivate` tests |
| nizam shows the warning and the confirm step | `passivation.spec.ts` (lines, `canConfirm`, `changedImpact`), `madrasahs.spec.tsx` ("Pasife al" on an ACTIVE row only); the dialog's interaction is not unit-tested, Playwright updated and not run |
| nazir shows it | not built: D2 |
| The audit row records the confirmed impact | "passivates with the token of the preview and records the impact it confirmed" and the medrese's |
| The engine closes the descendants, no engine change | "closes a course below the köşk…" and "closes the medrese's courses in every köşk…" (the HTTP proof the dossier said was missing) |

## Not verified

- Playwright (`apps/nizam/e2e/kosk-view.e2e.ts`, `madrasahs.e2e.ts`) was updated and one medrese flow was
  added, but they need a running stack with Keycloak and a seeded database; **they were not run**.
- The dialog component itself (preview on open, the replaced numbers after a 409, the shut button) was not
  rendered: Base UI's Dialog portals and nizam has no testing-library. Its state rules live in `present.ts`
  and are tested; the wiring is covered by `tsc`, not by a test.
- The en and ar copy is an unreviewed translation of the Turkish (MDRS-202 owns the real renderings); the
  owner said Turkish only for now, and the typed `Messages` come from `en`.
- `pnpm nx run-many -t build` (needs the root `.env`) and the whole tedrisat suite were not run; the
  integrator runs the suite. The gate run here is the list above.
