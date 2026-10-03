# MDRS-179: Nizam notifications and account (nizam/37, 46, 36, 47)

Package stack-49. Four screens, two pages in `apps/nizam`: Bildirimler
(`/[locale]/bildirimler`, nizam/37 for the köşk nazımı and nizam/46 for
Medaris administration) and Hesap ve ayarlar (`/[locale]/hesap`, nizam/36 and
47). Base branch: `release/stack-48-nizam-yasak`.

## What was done

### API (tedrisat)

- `GET /notifications` takes an optional `types` query, a comma separated list
  of notification types. An unknown type answers 400. The list, the counts and
  the read endpoints are MDRS-167's, unchanged.
- Two notification types, `COURSE_BAN_PLACED` and `KOSK_BAN_PLACED`. The row
  stores the type and flat params (`source`, `koskName`, `courseTitle`,
  `talebeName`, `actorName`, `reason`); the web app words them in the reader's
  language.
- `BanService` is the first producer. A new course ban or a new whole-köşk ban
  (including a widened one) tells the köşk's nazımları and every Medaris
  nazımı, the person who placed it left out. A request that finds the same
  open ban already standing (`created: false`) tells nobody. A notification
  that cannot be written is logged and never undoes the ban.
- No migration, so no number clash with the Linux lane.
- Not new, and used as they are: `GET /me`, `GET /me/assignments`,
  `GET /me/effective-permissions`, `PATCH /me` (time zone). The designs name
  `GET /me` with assignments and `PUT /me/preferences`; the existing endpoints
  already carry all of it.
- `libs/services/swagger-docs/tedrisat.json` and the generated client were
  regenerated with the exporter (`pnpm run openapi:tedrisat`, JDK 17).

### Web (nizam)

- `/bildirimler`: heading, description, "Tümünü okundu say", tabs
  "Tümü n" / "Okunmamış n", "Bildirim türü" chips, BUGÜN / DÜN / DAHA ÖNCE
  groups in the viewer's time zone, rows with icon, title link, "Yeni" badge,
  sentence, "source · time" and "Okundu say". Marking is optimistic and rolls
  back with an error toast. "Daha fazla göster" pages by cursor. Loading
  skeleton, empty states and a retry state exist.
- The shell reads the unread count on the server: the Bildirimler menu item
  carries it as a badge read as "okunmamış", and the bell's name is
  `Bildirimler, N okunmamış` (`Bildirimler` for zero, no number drawn).
- `/hesap`: "Görevleriniz" table (role, scope with course badge and "Dersin
  imamı", grantor and date, term), "Etkin izinleriniz" per role with the
  sentences and notes of tedris/43 and the line about when they end, "Saat ve
  dil" (time zone saved on choosing, language fixed to Türkçe), the "Hesap"
  card with the read-only e-mail, the "Müderrislik" card with "Nazır'da aç"
  and "Çıkış yap" (to the one existing confirmation page).
- The person row of the shell now leads to `/hesap` (MDRS-168's
  `ACCOUNT_PATH` note).
- i18n: `nizam.NotificationsPage`, `nizam.AccountPage` and
  `nizam.Shell.bellUnread` in tr, en and ar. The English and Arabic wording of
  the new keys was written for this package and not reviewed by a native
  speaker.

## Differences from the designs, on purpose

- Type chips: only Tümü and Yasaklar. The designs also draw Yasaklı cihazlar,
  Dersler, İtirazlar, Deste önerileri (37) and Köşk başvuruları, Deste yayın
  istekleri, İtirazlar, Kalıcı yasak talepleri (46). None of those events has a
  model, so such a chip could never match; the descriptions under the heading
  speak of bans only for the same reason.
- The Medaris başnazımı is the realm's SYSTEM_ADMIN role and has no row in the
  database, so no notification can be addressed to them; nizam/46 for the
  başnazım is therefore an empty list until the Keycloak role members are read
  and made recipients. The Medaris nazımı, who does have a row, receives them.
- "Etkin" and "Listelenmeyen" badges on the köşk row of "Görevleriniz" are not
  drawn: nothing says which köşks are listed or what "Etkin" is.
- Hesap: the başnazım's row and the "Bütün izinler, her kapsamda" group are
  added by the page, as there is no assignment row for SYSTEM_ADMIN.
- Row click leads to the köşk's `/kosks/:id/yasaklamalar`; the designs do not
  say where a row should lead.

## Verified

- Unit (vitest): tedrisat `ban.service.spec` (4 new cases: who is told, the
  köşk wording, no repeat for a second request, a failed notification keeps
  the ban); nizam `notifications.spec.tsx` (sentences, targets, chips, day
  groups, clock formats, bell name, list-state transitions, page render, message
  coverage in three languages), `account.spec.tsx` (roles, badges, end-date
  note, zone choices, page render, message coverage in three languages),
  `shell.spec.tsx` (badge, bell name, person row link).
- tedrisat e2e against Testcontainers Postgres: `notification.e2e.spec.ts`
  (`types` filter, 400 for an unknown type), `ban.e2e.spec.ts` (one
  notification to the köşk's nazım with the sentence's values, none for a
  repeated ban).
- Playwright against the running API and app, a throwaway Postgres
  (`docker compose -p stack49 up -d medaris-db`, port 5499) and real Keycloak
  sign-ins (e2e-kosk-nazim, e2e-medaris-nazim, e2e-sistem-admin):
  `notifications.e2e.ts` (7) covers day groups and sentence, the Okunmamış tab
  and counts, "Okundu say" with the tab count, the menu badge, the bell name
  and persistence, "Tümünü okundu say", the Yasaklar chip with the tab, the
  signed-out redirect, and the whole path event to notification (the köşk
  nazımı bars a talebe in the browser and the Medaris nazımı sees the row);
  `account.e2e.ts` (8) covers the person row to Hesap, the roles table, the
  permission groups and the end note, the time zone saved and kept after a
  reload, "Diğer…" with the full list, the read-only e-mail and language,
  "Çıkış yap" and the signed-out redirect, and the başnazım's row.
  `shell.e2e.ts`'s sign-out spec was adapted: the person row now goes through
  Hesap.

## Not verified

- Dark theme, Arabic and RTL: the interface is Turkish and left to right at
  launch (canvas rules 3 and 40).
- The 390 px layout was looked at in a screenshot, not measured by a spec.
- A "Okundu say" that the API refuses (the rollback and its toast) is not driven
  by any spec; only the state transitions it relies on are unit tested.
- The notification page for the başnazım with real data: see above, it is empty
  by construction.
- The Co-Authored-By trailer the task text asked for was left out: the
  repository's CLAUDE.md forbids it.

## Gate

`typecheck`, `test`, `build`, `lint` and `module-boundaries` (each
`run-many ... --skip-nx-cache`) and `node tools/ci/biome-ratchet.mjs` were
green before the push. `shell.e2e.ts`'s nizam/51 phone-menu spec needs a
MEDARIS_NAZIM row for e2e-medaris-nazim in the database it runs against; on a
fresh database it fails for want of that row, not because of this package.
