# MDRS-181 — Köşk başvuruları, Platform ayarları, Denetim kaydı, Ders talepleri

Screens: nizam/15 "Köşk başvuruları", nizam/19 "Platform ayarları", nizam/17
"Denetim kaydı", nizam/39 "Gelen medrese dışı ders talepleri" (stack-51,
`nizam-basvuru-politika`). Coded on top of the stack top at the time
(`release/stack-50-nizam-deste`, position 50 of stack #130).

## What was done

**tedrisat** — migration `0044_platform_admin` (journal tag 0044, reserved in
`migration-rezerv.txt`). `drizzle-kit generate` numbers by journal length and
wrote `0042`; the SQL, the snapshot (`meta/0044_snapshot.json`, `prevId` = 0043's
id) and the journal tag were renamed by hand and the overwritten
`0042_snapshot.json` was restored. Down script in `src/database/rollbacks/`.

- `kosk_applications`: `decided_by`, `decided_at`, `reject_reason`, `kosk_id`.
- New tables `platform_policies` (`key`, `enabled`, `changed_by`, `changed_at`;
  an untouched key is absent and reads as off) and `course_requests` (köşk,
  medrese, title, reason, requester, status, answer, the course it became).
- `audit_log` gets `seq` (identity, the page's "#no") and two indexes for the
  newest-first cursor. Nothing updates or deletes a row, and the API has no
  route that could.
- `src/platform-access/` — `PlatformAccessService.assert(user, code)`: the
  başnazım (SYSTEM_ADMIN), or a Medaris nazımı holding the platform permission
  by a single grant or through a group; else 403. It reads `realm_access` itself
  and does **not** inject `AuthzService`: that service's role resolver reads
  through `KoskService`, which now writes to the audit trail through this class,
  and the provider cycle made `Test.compile()` hang with no error.
- `src/audit/` — `AuditService.record()` is the one writer other modules call;
  `GET /nizam/audit-log?actor=&type=&scope=&from=&to=&cursor=` (50 a page,
  `(created_at, id)` cursor carrying the database's own timestamp text) and
  `GET /nizam/audit-log/export` (CSV, at most 10 000 rows, cells neutralised with
  `neutralizeFormula`; the export writes an `audit.export` row after reading).
  Permission "Denetim kaydını oku". The "Ne yaptı" kinds are a table over the
  stored `<entity>.<verb>` (`audit-types.ts`) read by both the label and the SQL
  filter; the scope is derived from the row (the köşk or medrese it is, a
  `koskId` / `madrasahId` it names, or the köşk of its course), else the
  platform.
- `src/kosk-application/` — `GET /nizam/kosk-applications?status=`, `GET …/:id`
  (the applicant's e-mail and phone: the read is written to the audit log as
  `kosk_application.contact_read` first), `POST …/:id/approve {koskId}` (the köşk
  was opened with `POST /kosks`; the application is accepted with it, the
  applicant gets `KOSK_APPLICATION_RESULT`), `POST …/:id/reject {reason}`. 409
  `KOSK_APPLICATION_DECIDED` on a second answer. Permission "Köşk başvurularını
  karara bağla".
- `src/platform-policy/` — `GET /nizam/platform-policies`, `PUT
  /nizam/platform-policies/:key {enabled}`, `GET /nizam/scoped-policies`;
  permission "Platform politikalarını değiştir". Keys `ALWAYS_REQUIRE_APPROVAL`
  and `RECORDINGS_NEVER_PUBLIC`. In force at once: `CourseService.enroll` makes
  every enrolment PENDING while the first is on, recordings are not shown to
  outsiders while the second is on, and `KoskService.update` refuses (409
  `PLATFORM_POLICY_LOCKED`) a köşk switching either rule off. A köşk's own
  switch is now audited (`kosk.policy_change`), which is where "Açan" and
  "Tarih" of the table come from.
- `src/course-request/` — `POST /kosks/:id/course-requests` (the başmüderris of
  the medrese named in the body), `GET /kosks/:id/course-requests?status=`,
  `POST /course-requests/:id/accept {courseId}` (the course opened from the
  request must be one of the köşk's), `POST /course-requests/:id/reject
  {reason}`. The köşk's nazım or the başnazım; 409 `COURSE_REQUEST_NOT_PENDING`.
- OpenAPI spec and the generated client regenerated.

**nizam-web** (`features/platform-admin/`, new)

- `/talepler/kosk-basvurulari` (nizam/15), `/denetim-kaydi` (nizam/17),
  `/ayarlar/platform` (nizam/19), `/kosks/:id/ders-talepleri` (nizam/39): the
  menu entries already pointed there. Master/detail with tabs for 15 and 39,
  filters in the URL for 17, switches with an optimistic update that moves back
  on a refusal for 19.
- "Köşkü aç" opens the existing köşk form filled from the application (name,
  field, description, the applicant as the first nazım) and accepts the
  application when the köşk exists. "Kabul et" of a course request opens the
  course form with the request's name; the form accepts the request once the
  course exists. Reasoned refusals reuse the deck screens' `RejectDialog`.
- The export goes through `app/api/audit-log/export/route.ts`: the browser has
  no bearer token.
- Messages in tr, en and ar (`KoskApplicationsPage`, `AuditPage`,
  `PlatformSettingsPage`, `CourseRequestsPage`, two kinds in `DeckReject`).

## What was verified

Gate, in this worktree, every command with `--skip-nx-cache` and the shell
variables stripped: `typecheck` (17 projects), `test` (11 projects), `build` (8
projects), `lint` (17 projects) and `module-boundaries` (17 projects) green, and
`node tools/ci/biome-ratchet.mjs` at its baseline (0 errors, 70 warnings, 22
infos). Suite totals of the full `test` run were not itemised.

- tedrisat `test/e2e/platform-admin.e2e.spec.ts` (20 tests, real Postgres through
  Testcontainers, minted tokens): list and counts, no contact detail in the list,
  the audit row of a contact read, a reason-only refusal, 409 on a second answer,
  acceptance with the köşk, the permission matrix (başnazım, Medaris nazımı with
  and without the grant, köşk nazımı, başmüderris, no role, no token), cursor
  paging to the end, the combined filters, CSV export that writes its own row, no
  PUT / PATCH / DELETE on the log, both policies in force (enrolment waits, a
  köşk cannot switch the rule off, the scoped table), and the course requests.
- tedrisat `test/unit/audit/audit.spec.ts` (37 tests): the kinds table, the CSV,
  the cursor, the lock rule.
- nizam-web `test/platform-admin.spec.tsx` (23 tests): URL filters, API window,
  Bugün / Dün, the four views rendered, key parity of the new messages in tr, en
  and ar.
- Playwright `apps/nizam/e2e/platform-admin.e2e.ts` (11 specs), against tedrisat
  on a private Postgres (port 5499, `postgres:17-alpine`, migrated from empty by
  the app's own boot), nizam-web and the shared Keycloak with the `e2e-*`
  accounts: the tab counts equal the table's, `Verilmedi`, the contact-read audit
  row, Reddet disabled without a reason and the answered application moving to
  Karara bağlanan, Köşkü aç filled from the application and accepting it, the
  audit table, the URL filter, the export carrying as many rows as the table, 403
  as "Bu bölüm için izniniz yok" for a köşk nazımı, a switch saved at once and
  written to the log, and the three course-request specs.
- Existing nizam specs re-run after touching the köşk form, the course form and
  the reject dialog: `kosks`, `courses`, `shell` and `deck-review` e2e, 45
  passed, 6 skipped (accounts absent) and 3 failed: `shell` nizam/51 needs the
  Medaris nazımı's role row, which the fresh database does not have; `kosks`
  nizam/10 failed once because the talebe account was not in the environment
  and passed when it was; `deck-review` nizam/30 failed once and passed alone.
- The shared dev database on 5432 was not used: its migration history comes from
  another branch (`madrasahs.archived_at` already existed) and the boot's
  migration failed on it.

## What was not verified

- The "[KVKK saklama süresi]" retention text is still the placeholder: the value
  is the owner's to give.
- Medreses have no policy settings of their own, so the "Köşk ve medrese
  politikaları" table lists köşks only.
- Course requests do not notify the başmüderris: the tedris notification
  dictionary has no type for it and adding one is outside this package. Accepting
  and refusing are visible on the köşk's page.
- Nothing writes the kinds "Devral ya da düşür", "İtiraz ve kararı" and "Kalıcı
  yasak talebi ve kararı" yet (those screens are later); the filter offers them.
- `ILIKE` on a person's name follows the database collation: with a `C` locale a
  Turkish capital does not match its lower-case form.
- The başnazım's own role is not stored, so the "Kim" column shows no role under
  the başnazım's name.
