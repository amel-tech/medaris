# MDRS-135 follow-up: the köşk home does not offer what a passive scope refuses

Stacked on `taha/mdrs-136-open-scopes-with-their-admins` (tip `377d4b6e`). MDRS-135 (PR #177) closes every
`content` code in a passive scope, `enrollment.decide` included, and its note ("Passive scopes") says the
warning is not built. The first real-browser run of the nizam suite found the visible half of that: a
köşk nazımı opens the köşk home, sees a pending application with Onayla and Reddet, presses one and gets
a toast with the server's English message. This note records the fix. No migration.

## What changed

- **tedrisat.** `GET /kosks/:id/dashboard` gives each of `latestApplications` two more booleans:
  - `canDecide`: whether the viewer holds `enrollment.decide` on that course, read from the engine
    (`AuthzService.effective`, which writes no audit row) once per course; the başnazım is `true`, as the
    engine's bypass is.
  - `scopePassive`: the course, its köşk or its medrese once had a manager and has none now. It is the
    SQL form of the facts the engine's loader reads (`isPassiveScope`, the helper `enrolledCourseIds`
    already uses for the same three scopes: müderris of the course, köşk nazımı, medrese başmüderris).
  The route's own decision, `enrollment.decide` on `approve` and `reject`, is untouched.
- **nizam (köşk home, `kosk-home.tsx`).**
  1. A row with `canDecide: false` shows a sentence where the two buttons stood: the passive sentence when
     `scopePassive`, otherwise the Başvurular page's "Bu başvuruya karar verme yetkiniz yok.".
  2. A refusal that still comes back (a stale page, a race) goes through `decisionErrorKey`, the helper the
     Başvurular page uses, instead of printing `result.error` (the server's English). Forbidden and gone
     have their sentences; anything else says "Beklenmeyen bir hata oldu." as before.
  3. An application someone else already decided (`ENROLLMENT_NOT_FOUND`, `ENROLLMENT_STATE_CONFLICT`) is
     dropped from the card, its number decrements and the server data refreshes, as on the Başvurular page;
     in the Reddet dialog the dialog closes with the row.
- **i18n.** `nizam.Dashboard.applications`: `errorForbidden`, `errorGone`, `passiveScope`, one block right
  after `errorUnknown`, tr, en, ar. The first two repeat the Başvurular page's sentences.

## Behaviour changes the owner will notice

- On the köşk home, a pending application of a passive course (a medrese whose başmüderris post ended, a
  course whose müderris left, a passive köşk) has no Onayla and Reddet any more; it says why.
- A Medaris nazımı who holds `platform.kosk_edit` but no course work reads a köşk's home page (that route
  is unchanged) and used to see Onayla and Reddet that the route refused; they now see "Bu başvuruya karar
  verme yetkiniz yok." on every row. This is not a passive case and says so with the generic sentence.
- The wire: `KoskDashboardApplicationResponse` gains two required booleans, `canDecide` and `scopePassive`
  (additive for readers; the generated client and the spec are regenerated).
- Nothing else: the approve and reject routes answer as before.

## Decided by default, owner may overrule

1. **The passive sentence.** "Bu dersin kapsamı pasif: yöneticisi kalmadı. Yönetici atanana dek başvuruya
   karar verilemez." Nobody has worded it; the owner may reword it. The generic sentence is the Başvurular
   page's existing one.
2. **One field answers "may the viewer decide", another says why.** Showing "pasif" for a Medaris nazımı
   with no course work would be wrong, so the passive flag is separate from the engine's answer rather
   than inferred from it.
3. **A passive row loses both buttons, Reddet too.** The engine closes `enrollment.decide` for both
   routes, so refusing a talebe is no more possible there than approving.
4. **Commit order.** The regenerated client is the second commit, not the last: the web commit needs the
   new type to typecheck. It is still its own commit and can be dropped and redone from the merged tree.

## Tests, and what each fails without

| Criterion | Test | Without the change |
| --- | --- | --- |
| `canDecide` is the engine's answer, false in a passive scope and for a role with no course work | `apps/tedrisat/test/e2e/kosk-dashboard-passive.e2e.spec.ts`: "marks the application of a medrese course passive once its head's post has ended", "... a course whose müderris left passive too", "says a Medaris nazımı who holds no course work cannot decide ..." | `canDecide: true` hard-coded in the service: 4 failed, 5 passed |
| `scopePassive` reads the three scopes (course müderris, köşk nazımı, medrese başmüderris) | same spec: the medrese-head and course-müderris cases, "marks every application of a köşk whose nazımı left passive ..." (read as the başnazım and as a Medaris nazımı) and "keeps the başnazım's bypass" | `scopePassive: false` hard-coded in the repository: 4 failed, 5 passed; deleting only the köşk-nazım term: 1 failed, 8 passed (the köşk case) |
| open course and a medrese with an active head again keep the decision | "offers the decision where ...", "offers the decision again once the medrese has an active head" | pins existing behaviour; passes with and without the change |
| the API refusal stays, nothing is written, for Onayla and for Reddet | "still refuses the decision on the route, and writes nothing" (approve on the passive medrese course) and "still refuses Reddet on the route wherever the screen hides it ..." (`DELETE /courses/:id/enrollments/:userId` on the passive medrese course, on the course whose müderris left, and as a Medaris nazımı on a köşk course): each 403 `AUTHZ_FORBIDDEN`, the enrollment still `PENDING`, the köşk's own course still decidable by the köşk nazımı | pins existing behaviour; passes with and without the screen change. Pointing the reject route's `@Authz` at `COURSE_VIEW` instead of `ENROLLMENT_DECIDE`: the Reddet case fails (1 failed, 8 passed) |
| a passive row shows the reason, not the buttons; an open row keeps them | `apps/nizam/test/kosk-home-decisions.spec.tsx` (happy-dom): "shows the reason in place of both buttons ...", "says plainly that the viewer may not decide ...", "keeps Onayla and Reddet ..." | the file run against `kosk-home.tsx` as it was before the web fix (`1039b583`): 7 failed, 2 passed (9). The two that pass are "keeps Onayla and Reddet ..." and the stays-open case below, which pin behaviour the old component already had |
| the refusal is in Turkish on Onayla and on Reddet | same spec: "is worded in Turkish on Onayla ...", "... on Reddet too", "falls back to the unknown sentence ..." | same run: the description was the server's text |
| a refusal that is not "gone" keeps the Reddet dialog (and the typed reason) and the row | same spec: "keeps the Reddet dialog and the row open on a refusal ..." | `reject` changed to close the dialog on every refusal (`failure(...); return true;`): 1 failed, 8 passed |
| a decided-by-someone-else row is dropped, and closes the Reddet dialog | same spec: "drops the row ...", "closes the Reddet dialog ..." | removing `settled(a)` on `errorGone`: both fail; making `reject` return `false`: the dialog test fails; swapping the passive and generic sentence: 2 fail |

The unit-level `decisionErrorKey` cases stay where they were (`apps/nizam/test/applications.spec.tsx`).

## Verified, with the commands

- `cd apps/tedrisat && e2e-slot.sh vitest run test/e2e/kosk-dashboard-passive.e2e.spec.ts test/e2e/nizam-dashboard.e2e.spec.ts test/e2e/authz-route-inventory.e2e.spec.ts`:
  3 files, 21 tests passed (the new spec has 9). The route inventory is unchanged: no route's decision moved.
- `node tools/ci/assert-openapi-spec-fresh.mjs`: fresh (169 paths) after `pnpm run openapi:tedrisat`.
- `apps/tedrisat/test/unit/openapi-document.spec.ts`: 6 passed.
- `cd apps/nizam && vitest run`: 41 files, 687 tests passed (the new spec has 9).
- `nx run nizam-web:typecheck`, `tsc --noEmit` in `apps/tedrisat`, `biome check` and commitlint on each commit: clean.
- i18n key parity of `nizam.json` across tr, en, ar by script: 2945 keys each, no difference.

## Not done, not verified

- **Other screens that still offer the buttons.** The Başvurular page and a course's Talebeler tab share
  `useDecisions` and list the same pending applications; they keep Onayla and Reddet in a passive course and
  only word the refusal (as before). Their read models are not the köşk home's and were not in this cut.
- **Playwright.** `apps/nizam/e2e/dashboard.e2e.ts:245` and `:271` press Onayla on a passive course; they
  were not touched or run (the seed and the specs are a later pass). They need a running stack.
- **Medaris nazımı who opens passive scopes.** `canDecide` follows the engine, which keeps content codes
  for a holder of `platform.inactive_scopes_manage` in a passive scope; no test seats that person.
- The scout dossier handed over for this issue is the MDRS-143 one (hide and restore); it does not
  describe this work and was not used beyond confirming `course.service.ts` is not touched here.
