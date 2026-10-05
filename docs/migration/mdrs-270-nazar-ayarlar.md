# MDRS-270 — Ders ayarları in nazar

Base: `taha/mdrs-270-course-nazir-api` at `1da339fe` (`origin/main` `0ca50a3d` plus the API half of
MDRS-270). Branch `taha/mdrs-270-nazar-settings`. This is the "ders ayarları" half of the başnazım's request ("nizam'da
bulamadım başnazım olarak, nazar'a … ekle ders ayarları ve ders nazırı atama şeyini"): nazar's
`/ders/<id>/ayarlar`, which was the shared placeholder, is now the course's settings page. "Ders nazırları"
is built in a branch of its own, and so is the shell change that lets the başnazım open a course page in
nazar by its address. Every number below was read off the command next to it, run in `apps/nazar` unless a
path says otherwise.

## What changed

- `app/ders/[dersId]/ayarlar/page.tsx` and `loading.tsx`: the route, titled "Ders ayarları"; the static
  folder wins over `[bolum]`, so the menu entry that already existed (`Nav.ders.settings`, `nav.ts`
  unchanged) now opens the page.
- `features/course-settings/`:
  - `course-settings.ts` (pure, goes to the browser with the form): the form's values, the sample
    session (`sampleOf`, `sampleOptions`, written again from nizam's `present.ts`, not imported across
    apps), `courseSettingsPatch` (only the fields that differ, never `null`, never `version`; `null` when
    nothing differs), `settingsDirty`, `courseSettingsErrorKey`, `coursePageUrl`.
  - `controls.ts`: `controlsOf(held, stored)`, what the caller may change (table below). It imports the
    permissions read (`features/account/course-permissions`), so it stays on the server: the page decides
    and hands the form the answer.
  - `actions.ts`: `saveCourseSettings` (`PATCH /courses/:id` with the changed fields), `setCourseStatus`
    (`PATCH /courses/:id` with `{ status }` alone), `setSampleLesson` (`PATCH /lessons/:id` with
    `{ version, isPreview }`). `ActionOutcome`, only the code reaches the browser, `console.error` on a
    failure.
  - `components/course-settings-page.tsx` (server): reads the course and `my-permissions`, gates the page,
    draws the header with "Tanıtım sayfasını gör" (`${TEDRIS_URL}/tr/courses/<id>`, a new tab, only when
    `TEDRIS_URL` is set), the form on the left and the Yayın card on the right (the two-column layout of
    Medrese ayarları). The form is keyed by the course version.
  - `components/course-settings-form.tsx` (client): Kapalı ders and Kayıt onayı gereksin as bordered
    checkboxes (they wait for Kaydet), Örnek ders and Saat dilimi as selects, Vazgeç and Kaydet.
  - `components/course-publish-card.tsx` (client): Yayında/Taslak, "Yayımla" at once, "Taslağa çek" after
    an AlertDialog whose focus starts on "Vazgeç".
- `features/account/course-permissions.ts`: `CODES.courseSettings`, `coursePublish`, `settingApprovalOff`,
  `settingCourseOpen`; `PAGE_CODES.settings = [course.edit, course.settings, course.publish,
  session.manage]`.
- `libs/i18n/src/locales/{tr,en,ar}/nazar.json`: one block `CourseSettings` after `CourseStudents`.
- `e2e/course-settings.e2e.ts`: the browser scenarios, written for the browser phase, not run here.

No API change: the page uses `GET /courses/:id`, `GET /courses/:id/my-permissions`, `PATCH /courses/:id`
and `PATCH /lessons/:id`, all on `main`. The API branch pinned the derived `setting.*` codes in
`my-permissions` ("lists the settings abilities a müderris holds, and drops the one a policy closes",
`course-my-permissions.e2e.spec.ts`), which is what the locks below are drawn from.

## Who sees which control

The page opens for a caller whose `GET /courses/:id/my-permissions` holds any of `course.edit`,
`course.settings`, `course.publish`, `session.manage`; anyone else gets "Bu sayfaya izniniz yok", a refused
course read too, and a read that failed is the retry state ("Ders ayarları yüklenemedi"), never "izniniz
yok". `PATCH /courses/:id` asks `course.edit` at the route before it looks at a field, and the field's own
code inside (`CourseService.assertMayChangeSettings`), so each control is open only when both are held:

| Control | Open when the caller holds | Otherwise |
| --- | --- | --- |
| Kapalı ders | `course.edit` and `course.settings` | stored closed, `course.settings` held, no `setting.course_open` (the medrese's "Kapalı ders zorunlu"): ticked, shut, "Medresenin “Kapalı ders zorunlu” politikası bu ayarı kilitler."; an open course under that policy may still be closed. Without the codes: the stored value, shut |
| Kayıt onayı gereksin | `course.edit` and `course.settings` | `course.settings` held, no `setting.approval_off` (a policy at Medaris, köşk or medrese level): ticked, shut, the policy sentence, never sent. Without the codes: the stored value, shut |
| Saat dilimi | `course.edit` | the stored zone, shut |
| Örnek ders | `session.manage` (`PATCH /lessons/:id`) | the stored sample, shut |
| Kaydet, Vazgeç | at least one control above is open | not drawn; "Bu ayarları değiştirme izniniz yok; yalnız görebilirsiniz." |
| Yayımla, Taslağa çek | `course.edit` and `course.publish` | the card shows the status only |
| "Dersi düzenle" note | `course.settings` or `course.publish` held without `course.edit` | — |

The başnazım's `my-permissions` is the fixed `SYSTEM_ADMIN_COURSE_CODES`, which holds every code above and
both `setting.*` codes, so every control is open to him and no policy locks one (no policy refuses him).

Every control that is shut or not drawn has its API refusal tested on `main`: `authz-engine.e2e.spec.ts`
"publishing needs course.publish and the settings need course.settings, not just course.edit", "the
medrese's 'closed course required' holds on an update …", "a ders nazırı widened past a köşk policy needs
course.edit as well …", "the başnazım's save of 'requires approval: false' answers 200 …";
`PATCH /lessons/:id` is `session.manage` in the route inventory.

## What Kaydet sends

The sample session moves first, with its own writes, in nizam's order: the old sample is unset with the
page's version, then the new one is set with the `courseVersion` that write returned, so a failure leaves
no sample rather than two. Then one `PATCH /courses/:id` carries only `isClosed`, `requiresApproval` and
`timeZone` that differ from what was read: a PATCH counts every field it carries as a change, so sending an
unchanged `requiresApproval: false` under a policy would be 409 `PLATFORM_POLICY_LOCKED`. The PATCH takes no
version (the last save wins). A refusal is worded from its code in a toast that stays
(`AUTHZ_FORBIDDEN` "Bunu yapma izniniz yok.", `PLATFORM_POLICY_LOCKED` "Bir politika bu değişikliği
kilitliyor; ayar değiştirilmedi.", `COURSE_VERSION_CONFLICT` nizam's "Ders, bu sayfayı açtığınızdan beri
başkası tarafından kaydedildi. …", `VALIDATION_ERROR` "Bu değer kaydedilemez. …", anything else nizam's
generic sentence). When the second sample write fails after the first one succeeded, the toast says
"Örnek ders kaydedilemedi; şu an bu dersin örnek dersi yok." A save that wrote part of the change reads the
page again, so the form shows what is stored.

## Not on the page, and why

- Icazet (`grantsCertificate`): d-0928-20 "Başta böyle ama sonra düzgün bir şey yapacağız"; MDRS-149.
- The müderris list and the imam: `course.open_standalone` / `madrasah.muderris_manage`, neither a
  müderris's nor a ders nazırı's code; a medrese course has them on the medrese's Dersler page.
- "Dersi gizle": d-1004-14/26/32 "sonra".
- The köşk policy "Ders kayıtları herkese açılamaz": a köşk setting; the köşk nazımı works from nizam
  (d-1001-06).
- An enrolment limit: no such column.

## Behaviour changes users will see

- `/ders/<id>/ayarlar` was "Bu sayfa henüz hazır değil."; it is now the settings page for the four codes
  above, and "Bu sayfaya izniniz yok" for anyone else in the course (a ders nazırı with no such grant).
- Every save bumps the course version, as any `PATCH /courses/:id` does: a Müfredat form open in another
  tab answers its next save with the existing conflict message and reloads.
- A course settings change writes no audit row (today's behaviour), and the page claims none.

## Decided by default, owner may overrule

- No API change: a control is drawn open only when its route would accept it; `course.settings`
  without `course.edit` (a narrow grant, or a passive course, where `course.edit` is closed) shows the
  values shut with the "Dersi düzenle" note, instead of a Kaydet that answers 403.
- What the page leaves out (above).
- No audit row and no audit claim for a settings change (d-1001-12 "gerektiği kadar log veririz").
- No `GET /courses/:id/stats` read (it writes `course.roster_read` for every non-müderris viewer):
  the note under "Taslağa çek" is nizam's sentence without a number.
- A policy-locked approval box is shown ticked even on a course stored without approval (the enrolment
  waits anyway, MDRS-207) and is never sent.
- A save stopped half-way (the sample moved, the course fields refused) reads the page again: the form
  starts from what is stored, and the toast says what failed.

## Where the design note and the code differed

- `controlsOf` lives in `controls.ts`, not in `course-settings.ts`: the form is a client component and
  imports `course-settings.ts`; `course-permissions.ts` imports the server read (`tedrisat-read` →
  `auth_options`, which reads server-only environment at module load). The first form spec run showed it:
  "Attempted to access a server-side environment variable on the client".
- `viewPublicLabel` ("{name} dersinin tanıtım sayfasını yeni sekmede aç") became `viewPublicHint`
  ("(yeni sekmede açılır)"), read after the visible "Tanıtım sayfasını gör" as Medrese ayarları's
  `viewPageHint` is: an `aria-label` that does not contain the visible text breaks label-in-name.
- `closedLocked` and `needsEdit` use typographic quotes, as `OpenCourse.lock.closed` does.
- "readOnly" is reachable only together with the "Dersi düzenle" note: every page code but
  `course.settings` and `course.publish` opens a control, so a page with nothing open is always one
  whose caller lacks `course.edit`. Both sentences are drawn then.
- The doc is `mdrs-270-nazar-ayarlar.md`, as the assignment names it.
- S6 (a "Nazar'da aç" link on nizam's course overview for the başnazım) is not in this branch: the
  assignment keeps it to `apps/nazar` and `libs/i18n`.

## Tests

| Spec | What it pins | Result |
| --- | --- | --- |
| `test/course-settings.spec.ts` (new) | what Kaydet sends; `controlsOf` for edit with settings, edit alone, settings alone, publish alone, session.manage alone, nothing, each policy lock; the sample options; the error keys; the public link | 17 passed (17) |
| `test/course-settings-page.spec.tsx` (new) | the gate for code sets without the page's codes; a refused course or permissions read; the retry state; the publishing buttons; every shut control and lock with its sentence; the "Dersi düzenle" and read-only notes; the public link; the loading bars | 13 passed (13) |
| `test/course-settings-form.spec.tsx` (new) | Kaydet off until dirty, Vazgeç; the PATCH body; a locked box never sent; the two sample writes in order with the returned version; the second write's failure; refusals worded and kept; a partial save read again; Taslağa çek asks first, Vazgeç sends nothing; Yayımla; a refusal | 16 passed (16) |
| `test/course-settings-actions.spec.ts` (new) | each action's exact client call and body; the code on a refusal; nothing written without a session | 7 passed (7) |
| `test/course-permissions.spec.ts` | `PAGE_CODES.settings` | 8 passed (8) |
| `test/placeholder.spec.tsx` | `ayarlar` has its own folder; the placeholder assertion on it goes (`deste` stays the example) | 8 passed (8) |
| `test/messages.spec.ts` | the `CourseSettings` block in all three languages, its run-time error keys, its formatting | 6 passed (6) |

Whole nazar suite: `./node_modules/.bin/vitest run` → `Test Files  57 passed (57)`,
`Tests  1200 passed (1200)`; the four new spec files hold 53 of those tests (17 + 13 + 16 + 7).

### Red, then green

Each line: a source line put back or changed by a script (`mutate.py`, which restores the file from git
after the run), the specs run, and the tests that went red. Every one of them is green on the branch.

| # | Source change | Specs run | Red | One failing assertion |
| --- | --- | --- | --- | --- |
| M1 | the boxes open without `course.edit` (`controlsOf`) | pure, page | 2 of 30: "shuts everything to course.settings without course.edit …", "opens nothing to course.settings without course.edit …" | `expected 'Ders ayarları…' to contain 'Bu ayarları değiştirme izniniz yok; y…'` |
| M2 | publishing drawn without `course.edit` | pure, page | 2 of 30: "draws 'Yayımla' and 'Taslağa çek' only for course.edit with course.publish …", "draws no publishing for course.publish without course.edit …" | `expected 'Ders ayarları …' not to contain 'Taslağa çek'` |
| M3 | the approval box not held by a policy | pure, page | 2 of 30: both "holds 'Kayıt onayı gereksin' ticked …" | `expected false to be true` |
| M4 | the closed box not held by the medrese's policy | pure, page | 2 of 30: both "holds a closed course closed …" | `expected false to be true` |
| M5 | the time zone open without `course.edit` | pure, page | 6 of 30, among them "opens only the sample session to a caller who holds session.manage alone" | `expected false to be true` |
| M6 | the sample open without `session.manage` | pure, page | 5 of 30, among them "keeps the boxes shut to course.edit without course.settings, and the sample to a caller without session.manage" | `expected false to be true` |
| M7 | the gate ignores a refused course read | page | 1 of 13: "is that state when the API refuses the course or the permissions" | `expected 'Ders ayarları Ders ayarları yükleneme…' to contain 'Bu sayfaya izniniz yok'` |
| M8 | the gate opens to other course codes | page | 1 of 13: "is 'Bu sayfaya izniniz yok' for every code set without the page's codes …" | `expected 'Ders ayarları Bina ve İzhar Şerhi der…' to contain 'Bu sayfaya izniniz yok'` |
| M9 | Kaydet sends `isClosed` unchanged | pure, form | 9 of 33, among them "sends only what changed to PATCH /courses/:id …", "is nothing while nothing differs" | `expected false to be true` |
| M10 | a locked approval box shows the stored value | page, form | 2 of 29: "holds 'Kayıt onayı gereksin' ticked and says why …", "never sends a box a policy holds ticked" | `expected false to be true` |
| M11 | the second sample write carries the page's version | form | 1 of 16: "unsets the old sample with the page's version, then sets the new one with the version that write returned" | `expected [ …(2) ] to deeply equal [ …(2) ]` |
| M12 | a failed second sample write worded generically | form | 1 of 16: "says the course has no sample now when the second write fails …" | `expected 'Ayarlar kaydedilemediBunu yapma iznin…' to contain 'Örnek ders kaydedilemedi; şu an bu de…'` |
| M13 | no reading again after a partial write | form | 2 of 16: "says the course has no sample now …", "reads the page again when the sample moved but the course's fields were refused" | `expected "vi.fn()" to be called once, but got 0 times` |
| M14 | the "Dersi düzenle" note not drawn | page | 1 of 13: "shuts everything to course.settings without course.edit …" | `expected 'Ders ayarları…' to contain 'Bu ayarları değiştirmek için “Dersi d…'` |
| M15 | Kaydet drawn with no open control | page | 1 of 13: the same test | `expected 'Ders ayarları…' to contain 'Bu ayarları değiştirme izniniz yok; y…'` |
| M16 | "Taslağa çek" without asking | form | 2 of 16: "asks before 'Taslağa çek', with the focus on 'Vazgeç' …", "sends the status alone once the question is answered …" | `TypeError: Cannot read properties of null (reading 'textContent')` (no question) |
| M17 | the publishing buttons for anyone | page, form | 3 of 29, among them "shows the status alone to a caller who may not publish" | `expected <button …></button> to be undefined` |
| M18 | the status body carries another field | actions | 1 of 7: "send the status alone" | `expected "vi.fn()" to be called once with arguments: [ { id: 'c-1', …(1) } ]` |
| M19 | the settings body carries another field | actions | 1 of 7: "sends the changed fields alone to PATCH /courses/:id …" | the same, for `updateCourse` |
| M20 | the sample body always marks (`isPreview: true`) | actions | 1 of 7: "unmarks a session the same way, and hands back the code of a stale page (409)" | `expected "vi.fn()" to be called once with arguments: [ { id: 'l-1', …(1) } ]` |
| M21 | the public link without `TEDRIS_URL` | pure, page | 2 of 30: "links to the course's public page in a new tab, only when Tedris's address is set", "is Tedris's Turkish course page, and absent …" | `TypeError: Invalid URL` |
| M22 | `PAGE_CODES.settings` without `session.manage` | course-permissions, page | 2 of 21: "names the codes each page asks, from the routes it calls", "opens only the sample session to a caller who holds session.manage alone" | `expected [ 'course.edit', …(2) ] to deeply equal [ 'course.edit', …(3) ]` |
| M23 | `CourseSettings.errors.policy` missing from `en` | messages | 2 of 6: "has the same keys in every locale", the run-time keys test | `expected [ …(1300) ] to deeply equal [ …(1301) ]` |
| M24 | a policy's lock worded generically | pure, form | 3 of 33, among them "words a policy's lock and a refusal from the code, in a toast that stays …" | `PLATFORM_POLICY_LOCKED: expected 'Ayarlar kaydedilemediİşlem tamamlanam…' to contain 'Bir politika bu değişikliği kilitliyo…'` |
| M25 | `app/ders/[dersId]/ayarlar/page.tsx` moved away | placeholder | 1 of 8: "leaves the sections that have a page to their own route folder" | `ayarlar: expected false to be true` |

M20 first stayed green (7 passed (7)): the actions spec checked the sample body only with
`isPreview: true`. The stale-page case now checks the unmarking body too, and M20 went red; that fix is
its own commit.

### Criterion → test

| MDRS-270 | Test |
| --- | --- |
| "each control gated by its own permission" | `course-settings.spec.ts` "what the caller may change (controlsOf)" (M1–M6), `course-settings-page.spec.tsx` per control (M1–M6, M10, M14, M15, M17) |
| AC3 "a button is never shown for a 403" | page spec "is 'Bu sayfaya izniniz yok' for every code set without the page's codes …" (M8), "draws 'Yayımla' and 'Taslağa çek' only for course.edit with course.publish …" (M2, M17), "shuts everything to course.settings without course.edit … draws no Kaydet" (M1, M15) |
| a refused read is "izniniz yok", a failed read the retry state | page spec "is that state when the API refuses the course or the permissions" (M7), "is the retry state, not 'no access' …" |
| a PATCH never carries an unchanged field, `null` or a version | `course-settings.spec.ts` "what Kaydet sends …" (M9), form spec "sends only what changed …" (M9), actions spec (M19) |
| the sample never ends up on two sessions | form spec "unsets the old sample with the page's version, then sets the new one …" (M11), "says the course has no sample now …" (M12, M13) |

## Gates

- `cd apps/nazar && ./node_modules/.bin/tsc --noEmit`: exit 0, 0 `error TS` lines. nazar's tsconfig
  includes `test/` and `e2e/`; `--listFiles` lists all 11 new files.
- Spec check (the temporary speccheck tsconfig of port-common): one error, `../../vitest.config.ts`
  TS2307 (the known noise), none in a file of this branch.
- `./node_modules/.bin/biome check` on every touched file: no fixes applied, no diagnostics.
- `node tools/ci/biome-ratchet.mjs`: errors 0 (baseline 0), warnings 70 (baseline 70), infos 21
  (baseline 21).
- `libs/i18n`: `tsc -b` exit 0; the library has no spec files of its own (the catalogue is checked by
  `apps/nazar/test/messages.spec.ts`).
- Libraries rebuilt after the install: `tsc -p tsconfig.json` in `libs/common`, `tsc -b` in `libs/icons`,
  `i18n`, `utils`, `services`, `ui`, all exit 0.

## Shared files, for the merge with the Ders nazırları branch

Lines as `git diff -U0 1da339fe` reports them (old → new):

| File | Change |
| --- | --- |
| `apps/nazar/features/account/course-permissions.ts` | after 22: four codes (new 23–26); after 36: `settings` (new 41–46) |
| `apps/nazar/test/course-permissions.spec.ts` | after 115: the `PAGE_CODES.settings` assertion (new 116–122) |
| `apps/nazar/test/messages.spec.ts` | after 5: the `courseSettingsErrorKey` import (new 6); after 245: the run-time keys (new 247–254); after 311: `"CourseSettings",` (new 321) |
| `apps/nazar/test/placeholder.spec.tsx` | 74–75: `"ayarlar"` joins `DERS_BUILT`; 88–90 deleted (the placeholder assertion on `ayarlar`) |
| `libs/i18n/src/locales/{tr,en,ar}/nazar.json` | after 1392 (the `},` closing `CourseStudents`): the `CourseSettings` block (new 1393–1445) |

Expected conflicts: `placeholder.spec.tsx` 74–75 (the design note's resolution: `DERS_BUILT` lists
`nazirlar` and `ayarlar`), and the import at line 6 of `messages.spec.ts` if the other branch imports
`courseNazirErrorKey` there too (keep both lines, `course-nazirs` first, as Biome sorts them).
`nav.ts`, the shell, `fixtures.ts` and `e2e/seed.ts` are not touched.

Merged in `taha/mdrs-270-nazar-course-nazirs-settings`: those two were the only conflicts and were
resolved that way (`DERS_BUILT` in the menu's order, `nazirlar` before `ayarlar`); the other files of
the table merged on their own, and the `CourseNazirs` and `CourseSettings` blocks each stay in one piece,
at the same place in `tr`, `en` and `ar`.

## Not verified

- `e2e/course-settings.e2e.ts` is written, not run (no Playwright, no stack, no dev realm here). Its
  başnazım scenario needs the shell admission of the Ders nazırları branch, so it is for the integrated
  branch; the optional policy scenario of the design (switching a medrese policy on and off) is not
  written.
- The page in a browser: the selects' accessible names (`getByRole("combobox", { name: "Örnek ders" })`)
  and the toasts are read from the kit's code and the happy-dom specs, not from a real browser.
- That the başnazım reaches the page in a running app: the other branch's shell change is merged in
  `taha/mdrs-270-nazar-course-nazirs-settings` (its `access.spec.tsx` stubs the reads), and tedrisat's
  `course-my-permissions.e2e.spec.ts` lists every course code for him; no browser has opened it.

## Risks that stay

- The MDRS-207 limit: a başnazım's (or a platform-widened grant's) "approval off" under a policy saves and
  is inert at enrolment; an unlisted köşk always makes enrolment wait, which `my-permissions` does not show,
  so the box is open there and saving it off changes nothing at enrolment.
- The sample session is two writes, not one transaction (nizam has the same); the order fails safe (no
  sample, never two).
- Turning a medrese's "Kapalı ders zorunlu" on does not close existing courses: such a course shows the box
  open and may be closed, never opened again.
