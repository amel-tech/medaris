# MDRS-182 — Nizam home pages (stack-52, nizam/01, 02, 05)

Three home pages of `nizam-web`, each fed by one read: the Medaris başnazımı's (nizam/01), a köşk nazımı's (nizam/02) and a Medaris nazımı's (nizam/05). Taken at stack #130's top, `release/stack-51-nizam-basvuru-politika`.

## What was done

Backend (`apps/tedrisat`):

- `GET /nizam/dashboard` (`src/nizam-dashboard/`): the başnazım (SYSTEM_ADMIN) and a Medaris nazımı. The nazım's page is the same read cut to what their platform permissions open (`dashboard-sections.ts`); a count or a list the viewer may not see is `null`, never `0`. Ders / Kayıtlı talebe are the başnazım's alone (nizam/05 draws neither). Anyone else is 403.
- `GET /kosks/:id/dashboard?sessions=UPCOMING|PAST|CANCELLED` (`src/kosk/kosk-dashboard.*`): authorized like the köşk overview (`EDIT` on the köşk: its nazımları and the başnazım). Numbers, the celse list of one tab, the newest five waiting applications, the müderrisler.
- `DELETE /courses/:id/enrollments/:userId` takes an optional body `{ reason }` (max 500). A refusal is now written to `audit_log` as `enrollment.reject` (with the reason when given); a call with no body behaves as before and is audited too.
- `InactiveScopeService.brief()` (the passive scopes without the people, no directory call); `AssignmentModule` exports `AssignmentService`, `InactiveScopeModule` exports `InactiveScopeService`.
- No migration, no new table. OpenAPI spec and the generated client were regenerated (`pnpm run openapi:tedrisat`; `assert-openapi-spec-fresh` passes).

Web (`apps/nizam`):

- `/` renders nizam/01 or nizam/05 by role; a köşk nazımı is redirected to `/kosks/<first>/ana-sayfa` (nizam/02). The köşk's Ana sayfa menu item and "Köşk değiştir" stay on that page.
- A Medaris nazımı's menu is cut to their permissions (`filterByPermissions` in `lib/shell-nav.ts`); if the permissions cannot be read nothing is hidden.
- "İncele" lands on `/talepler/kosk-basvurulari?secili=<id>` and `/talepler/deste-yayin-istekleri?secili=<id>` with that row selected; "Köşk aç" opens the form on `/kosks?ac=1` (başnazım).
- Reddet on a köşk application asks for "Ret gerekçesi (isteğe bağlı)"; the button is never held back.
- i18n `nizam.Dashboard` in tr, en and ar.

## Decisions

- İtirazlar and Kalıcı yasak talepleri have no model (nizam/44, 45 are a later phase): their count is `0` for a viewer who would see them; the nazım's "Kalıcı yasak talepleri" card shows its empty state and has no "Tümünü gör" (the page does not exist).
- Pasif kapsamlar "… ata" buttons link to `/pasif-kapsamlar`, where the assignment dialog is (nizam/14), rather than repeating that dialog.
- Celse buttons ("Toplantı bağlantısı ekle", "Düzenle", "Celseyi gör") go to the course's celse page `/kosks/:id/courses/:courseId/sessions`. "Tümünü gör" of Celseler goes to `/kosks/:id/celseler`, the path the menu already uses; that page is not built in this stack (404 until it is).
- A köşk nazımı who manages several köşks lands on the first; the picker switches.
- "Yaklaşan" is the next seven days; Geçmiş and İptal edilen count every session of the köşk's published courses.

## Verified

- `apps/tedrisat/test/e2e/nizam-dashboard.e2e.spec.ts` (10 tests, Testcontainers Postgres) and `test/unit/nizam-dashboard/dashboard-sections.spec.ts` (5).
- `apps/nizam` Vitest: 601 tests green (`dashboard-present.spec.ts`, `dashboard-views.spec.tsx`, updated `shell.spec.tsx`).
- Playwright `apps/nizam/e2e/dashboard.e2e.ts` (9 specs) against a private Postgres (port 5472), real tedrisat and nizam-web, real Keycloak sign-ins as e2e-sistem-admin, e2e-kosk-nazim and e2e-medaris-nazim: the numbers on the pages equal counts taken off the database; Onayla and Reddet (with and without a reason, audit row checked); the three tabs; the 390 px layout; the menu cut by permissions, and a revoked permission gone after a reload; `/izin-gruplari` is the "izniniz yok" screen for a nazım without it.
- Pages were compared to the canvas screenshots at 1440 and 390 px.

## Not verified

- nizam/01 criterion 3's "yöneticisiz" badge on the menu: the menu draws no such badge in this stack, so only the warning box is covered.
- Counts of appeals and permanent-ban requests (no model).
- The Arabic and English wording was not read by a native speaker.
