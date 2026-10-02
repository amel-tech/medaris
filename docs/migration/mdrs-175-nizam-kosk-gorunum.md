# MDRS-175 — Köşk, Medaris yönetimi görünümü, Dersler, Genel bakış

Screens: nizam/20 "Köşk — Medaris yönetimi görünümü", nizam/23 "Dersler",
nizam/53 "Genel bakış" (a course, for its köşk nazımı).
Base: the top of stack #130 when the PR was opened
(`release/stack-48-nizam-yasak`). The package was coded on
`release/stack-44-nizam-kosk-yonetimi`; taking the stack top in brought an older
copy of the MDRS-174 köşk work into conflict, resolved in favour of the stack top.

**Known gap (accepted by the product owner on 2026-10-02):** nizam/20's
"Çıkar" button on the köşk nazımları table, the "Son köşk nazımı ardılsız
çıkarılamaz" warning, the note on the roles and permissions the removed person
gave, and the Devral/Düşür dialog are not built. The 4 October release gate
(`_kurallar` 15) keeps them out, and the backend has no hand-over model or
removal endpoint for a köşk nazımı yet. They belong to a follow-up.

## What was done

**tedrisat** (`src/kosk/`, `src/course/`) — no migration: every column the three
screens read was there already (`kosks.archived_at/passive_since`, the
policies, `courses.archived_at`, `madrasah_kosk_hosting`, `bans`), so there is
no migration number to clash with the Linux lane.

- `GET /kosks/:id/overview` — nizam/20's numbers: the köşk's status and since
  when, who opened it and when, course counts (all, published, draft, hidden),
  the talebe enrolled (distinct, hidden courses left out), applications waiting
  (hidden courses left out), the nazımları held now and the medreses with a
  hosting right. `@Authz(EDIT)` on the köşk: its nazımları and SYSTEM_ADMIN.
- `GET /kosks/:id/course-roster` — nizam/23's table: every course of the köşk,
  hidden ones too, newest first, each with its weeks, medrese, müderrisler (the
  imam flagged), enrolled talebe, waiting applications and bans (open bans of
  the course or of the whole köşk, each person once), and the tabs' counts.
- `POST /kosks/:id/deactivate` — "Köşkü pasife al", SYSTEM_ADMIN only: sets
  `passive_since`, revokes every held KOSK_NAZIM row and writes one `audit_log`
  row (`kosk.deactivate`) naming the people taken off the post, in one
  transaction. 409 `KOSK_ALREADY_PASSIVE` when it is passive already. Adding a
  nazım afterwards makes the köşk active again (stack-44's `addNazims`).
- `GET /courses/:id/stats` — nizam/53's numbers: enrolled, pending, completed,
  weeks and "weeks that have begun" (a week with a live lesson dated now or
  earlier). Course team (`MANAGE_ENROLLMENTS`) behind `byExistingCourse`, so a
  missing course is 404 even for SYSTEM_ADMIN.
- Already there and used as they are: `POST /kosks/:id/hide|restore` (stack-44),
  `POST /courses/:id/archive|restore` ("Gizle", "Geri al": stack-43),
  `GET|DELETE /kosks/:id/hosting-rights` (stack-40).
- The OpenAPI document and the generated client (`libs/services`) are
  regenerated.

**nizam-web**

- `[locale]/kosks/[id]` is nizam/20 for the başnazım (summary cards, details,
  the three management actions, nazımları with "Köşk nazımı ekle", the hosting
  table with nizam/27's dialog, the courses table by status). A köşk nazımı who
  opens it is sent to `…/dersler`; anyone else gets nizam/06 (403 and 404 look
  alike). The old card grid (`kosk-detail-page.tsx`) is gone.
- `[locale]/kosks/[id]/dersler` is nizam/23: the four-card strip (three drawn),
  the tabs with the rows' own counts, "Düzenle", "Müderrisleri düzenle",
  "Dersi gör", "Gizle" (an `AlertDialog`) and "Geri al".
- `[locale]/kosks/[id]/courses/[courseId]` is nizam/53: the missing-link warning,
  the numbers, "Sıradaki celseler" (the nearest four that have not begun, a
  cancelled one keeps its slot), "Bekleyen başvurular" with Onayla/Reddet (the
  `useDecisions` of nizam/31), "Ders kadrosu" and the settings that matter.
- The köşk nazımı's sidebar item "Dersler" points to `…/dersler`; a course's own
  pages (overview, editor, new) keep it selected.
- i18n `KoskManage`, `KoskCourses`, `HideCourseDialog`, `DeactivateKoskDialog`,
  `CourseOverview` in tr, en and ar. (Rewriting the three `nizam.json` files
  dropped the earlier of two duplicate `KoskSettings` keys; JSON readers took
  the later one anyway, so no message changed.)
- Playwright `e2e/kosk-view.e2e.ts` (14 specs) and `e2e/kosk-view-seed.ts`.

## Decisions

- **Who sees nizam/20.** The başnazım. The page needs `EDIT` on the köşk, which
  a Medaris nazımı does not hold (stack-44: they get nizam/06); a köşk nazımı
  is redirected to Dersler, where their work is.
- **"Çıkar" and the "Son köşk nazımı ardılsız çıkarılamaz" notice are not
  drawn** (stack-44's decision stands): the successor dialog is nizam/22's
  design and no screen of this package carries it. So criteria 3 and 4 of
  nizam/20 are not met here; the notice would promise a window that is not
  there.
- **"Köşkü pasife al" is SYSTEM_ADMIN's**, like adding a nazım, and takes the
  nazımları off the post without the Devral/Düşür questions: the canvas draws
  none for it ("Dialog; nazımlar görevden alınır"). Roles and permissions the
  nazımları gave others are left as they are.
- **No "Köşk destesi" card** (nizam/23) and no "1 deste" in the details
  (nizam/20): a deck is not tied to a köşk in the backend (stack-43).
- **Not drawn in nizam/53**: the "Ders kaydı" card, the "Ders kayıtları"
  section, the YouTube line and "Ders nazırları" — the backend has no recording
  model and no ders nazırı model. "Müderrisleri düzenle" opens the course
  editor: the dialog of nizam/33 and the editor pages of nizam/54 and 55 belong
  to package 46. "Toplantı bağlantısı ekle"/"Düzenle" on a session do the same
  (nizam/56's inline form is a later package). The settings card draws the
  status, the enrollment rule and the time zone; "Kapalı ders" and "Örnek
  ders" have no field.
- **"Dersi gör"** opens the course on tedris (`TEDRIS_URL`), because the nazır
  app has no course page yet; the button is left out where the deployment has no
  tedris address. "Köşk sayfasını gör" likewise.
- **"Devam eden hafta"** is the weeks that have begun (a live lesson dated at
  or before now), over the programme's weeks; the canvas gives no rule.
- **"Kayıtlı talebe" excludes hidden courses** on nizam/20 (the canvas says so);
  the table's own rows for a hidden course show its talebe, as the canvas does.
- **"Yasaklı"** counts each barred person once, whether barred from the course
  or from the whole köşk.
- **Medrese courses and the köşk's "Dersler" count.** Dersler lists every
  course of the köşk, so a hosted course appears with its medrese's name under
  its title.

## Verified

- tedrisat against a real Postgres (Testcontainers): `kosk-overview.e2e.spec.ts`
  (14 specs): the overview's counts with a hidden course and a talebe in two
  courses, 403 for another köşk's nazım, a talebe and a stranger, 404; the
  roster's order, tabs, müderrisler with the imam flagged, talebe, waiting
  applications, bans of the course and of the köşk, a lifted ban left out; the
  deactivation (status, nazımları revoked, audit row, 409 the second time, 403
  for the nazım, 404); the course stats (counts, started weeks, approval moves
  the counts, 403 and 404). The tedrisat suite is 1108 tests, green.
- nizam-web: vitest `kosk-overview.spec.tsx` (36) — 20 files, 323 tests in the
  app, green. `shell-nav.spec.ts` pins "Dersler" staying selected on a
  course's pages.
- Playwright `e2e/kosk-view.e2e.ts` (14 specs) against the running API, a
  private Postgres and the real Keycloak (`e2e-sistem-admin`, `e2e-kosk-nazim`):
  nizam/20's numbers and tabs equal the database's, there is no delete and no
  course-work button on it, hide asks first and writes `kosk.hide`, "pasife al"
  revokes the nazım and writes `kosk.deactivate`, the hosting right is
  withdrawn from the table; nizam/23's tabs equal the database's and each
  narrows the list, the buttons per row kind, Gizle → Gizli → Geri al with the
  database following; nizam/53's sessions in date order with the cancelled one
  marked, the missing-link warning, Onayla moves Kayıtlı talebe from 2 to 3 and
  the application list to empty. The whole nizam suite: 69 passed, 19 skipped
  (the specs of other roles whose accounts were not in the environment).
- Screens compared with the canvas pictures at 1280 px (nizam/20, 23, 53): the
  sections, their order and the buttons match; the table widths were adjusted
  after the first look (the hosting action column clipped, "Toplantı bağlantısı
  ekle" clipped).
- Gate (all `--skip-nx-cache`): typecheck, test, build, lint, module-boundaries
  green; `node tools/ci/biome-ratchet.mjs` 0 errors, 74 warnings (baseline 74);
  `assert-openapi-spec-fresh` identical.

## Not verified

- **nizam/20 criteria 3 and 4** (the last nazım cannot leave without a
  successor; Devral/Düşür before the confirm): not drawn, see above.
- **nizam/23 criterion 3's "listed in the Arşiv"** and **criterion 5** (a
  non-nazım gets the 403 page): the API refuses another köşk's nazım, a talebe
  and a stranger (tested), and the route group's layout shows nizam/06; neither
  was driven in the browser here.
- **nizam/53 "Reddet"** was not driven in the browser (the endpoint is the one
  nizam/31's specs and the course specs cover); its row leaves the list through
  the same `useDecisions` as "Onayla".
- The pages in Arabic (rtl) and in English were not looked at in a browser; the
  messages exist and the key sets match, nothing more is claimed.
- "Dersi gör" and "Köşk sayfasını gör" were rendered with the tedris address;
  where they lead was not followed.
- Narrow (phone) widths were not looked at; the tables use the kit's stacked
  layout.
