# MDRS-172 — Kapsam izinleri, Pasif kapsamlar, Başmüderrisi değiştir

Screens: nizam/38 "Köşk kapsamında izin ver" (the köşk's İzinler page),
nizam/14 "Pasif kapsamlar", nizam/22 "Başmüderrisi değiştir / ata" (dialog).
Base: `release/stack-44-nizam-kosk-yonetimi` (it carries 38, 40 and 41). This is
the Mac lane (nizam/nazır packages); it is not linked to stack #130 until the
tedris lane (26, 29–36) is merged in.

**Migration numbering:** this package adds no migration, so it cannot clash with
a number the Linux lane takes.

## What was done

**tedrisat**

- `GET/POST /kosks/:id/grants`, `PATCH/DELETE /kosks/:id/grants/:grantId`
  (`src/kosk/kosk-grants.*`). A "grant" is a ders nazırı post: a `DERS_NAZIR`
  role in one medrese-free course of the köşk plus single course permissions in
  that course. The post and its permissions share one end and end together; the
  rows are revoked, not deleted. A köşk nazımı of that köşk and the başnazım may
  call (`@Authz(EDIT)`); a Medaris nazımı gets 403, like the other köşk screens.
- "Verdiğiniz izin, kendi izinlerinizi aşamaz": the codes must be in the
  18-code course catalog (else 400 `PERMISSION_UNKNOWN`) and held by the caller
  (else 403 `GRANT_EXCEEDS_GIVER`). A köşk nazımı holds `course.manage_all`,
  which opens the whole course catalog, so the 403 cannot be reached by one
  today (`grantableCourseCodes` is pinned by a unit spec).
- `GET /nizam/inactive-scopes?type=`, `POST /nizam/inactive-scopes/:type/:id/assign`,
  `POST …/view` (`src/inactive-scope/`). A scope is passive when it once had a
  manager (köşk nazımı, medrese başmüderrisi, course müderrisi) and has none
  held now; hidden scopes and ones never managed are left out. `reason` is
  `EXPIRED` or `REMOVED`, `since` is when the last post ended. Allowed: the
  başnazım, and a Medaris nazımı who holds `platform.inactive_scopes_manage`
  (single or through a group) — the first endpoint that reads that permission.
  Assigning gives a köşk its nazım (and clears `passive_since`), a medrese its
  başmüderris (through `MadrasahService.setHeadMuderris`), a course its müderris
  as imam and on the course page's `course_muderris` list. Every view writes an
  `inactive_scope.view` audit row.
- `PUT /madrasahs/:id/head-muderris` takes `endsAt` and `delegations`;
  `GET /madrasahs/:id/head-muderris/delegations` lists what the sitting
  başmüderris handed on (nazır roles and permission grants in that medrese's
  scope that are still held). Replacing a başmüderris needs one answer per item
  (`TAKE_OVER` keeps it under the caller's name, `DROP` revokes it) or the call
  is refused whole with 400 `DISMISS_DECISIONS_INCOMPLETE`; naming the one who
  already heads it, or a medrese with no başmüderris, asks nothing. All of it is
  one transaction and one `madrasah.head_muderris.set` audit row.
- The generated client (`libs/services`) is regenerated.

**nizam-web**

- `[locale]/kosks/[id]/izinler` (+ loading), `[locale]/pasif-kapsamlar` (+
  loading), `features/grants`, `features/inactive-scopes`; the grant dialog,
  the revoke dialog, the assign dialog of Pasif kapsamlar; the Medreseler row
  gets "Başmüderrisi değiştir" and `AssignHeadDialog` became nizam/22's window.
  `HeadPicker` takes a label, so the one e-mail search serves all four places.
  The menu entries of both pages already existed.
- i18n `KoskGrantsPage`, `KoskGrantDialog`, `KoskRevokeDialog`, `InactivePage`,
  `InactiveAssignDialog`, additions to `AssignHeadDialog` and `MadrasahsPage`,
  in tr, en and ar.

## Size

82 files change against the base: 21 are the regenerated client and the OpenAPI
document, 61 are written by hand (tedrisat 21 source files and 5 specs, nizam-web
24 files and 3 specs, 3 message files, 7 e2e files, this note). That is one over
the 60 the plan allows. The three screens depend on each other (the hand-over
window, Pasif kapsamlar and İzinler share the e-mail picker, the gate and the
audit trail), so no screen was moved to another package.

## Decisions

- Routes follow the existing English pattern: `/kosks/:id/grants/:grantId`
  (the spec said `PATCH /grants/:id`, which would have no köşk to authorize
  against), `/madrasahs/:id/head-muderris` extended rather than a second
  `/basmuderris`.
- A ders nazırı cannot hand anything on in this model, so "Görevden al" of one
  has no Devral/Düşür rows; it is a Dialog with "Vazgeç" focused (_kurallar 11,
  15). Its gate is the same client-side one as nizam/11 and nizam/22
  (4 Ekim 2026 00:00 Istanbul, button off, no reason written); the API itself
  does not know the gate.
- "Düzenle" on the Devral/Düşür rows of nizam/22 is not drawn: the design does
  not say whether it opens a second window or the same one, and there is no
  medrese-scope permission dialog to open.
- "İçeriği gör" opens a köşk (`/kosks/:id`) or a course
  (`/kosks/:k/courses/:id/edit`); a medrese has no page in Nizam (its page is
  Tedris', closed while passive), so its row has no such button. The API takes
  all three kinds.
- The notice under "Pasif kapsamlar" says only that opening is for the başnazım
  and permitted Medaris nazımları and is audited. The design's "kimse
  göremez", "celseler takvimden düşer" and "davet gönderilmez" are not written:
  nothing closes a passive scope's content or its calendar yet.
- A medrese's end date ("Süre dolunca ardıl yoksa medrese pasifleşir") is true
  in the sense that the medrese then appears in Pasif kapsamlar; no job sets
  `passive_since` (as before this package), so the Pasif tab of nizam/07 does
  not fill by itself.
- The page's "Görev ve izinler aynı gün biter." is printed when there is an
  end; for no end the cell says "Süresiz".
- Medrese courses are named in a note and cannot be given a ders nazırı here:
  "izni medrese kadrosu verir". The tuvalde's sentence with the medrese's name
  in the possessive is not written (a Turkish suffix cannot be added to a
  variable); the note names the courses instead.
- The Pasif kapsamlar badge in the menu is not drawn (the shell draws none for
  this package's screens yet).

## Verified

- tedrisat against a real Postgres (Testcontainers):
  `kosk-grants.e2e.spec.ts` (18), `inactive-scope.e2e.spec.ts` (13),
  `madrasah-head-change.e2e.spec.ts` (9), the existing
  `madrasah-directory.e2e.spec.ts` (22) still green; unit specs
  `kosk-grants-rules` (5) and `inactive-scope-rules` (6).
- nizam-web: vitest `kosk-grants.spec.tsx` (18), `inactive-scopes.spec.tsx` (13),
  `madrasahs.spec.tsx` (+1). Playwright `e2e/grants.e2e.ts` (8),
  `e2e/inactive.e2e.ts` (10), `e2e/head-change.e2e.ts` (4), run against the
  running API, a private Postgres (port 5491, started with
  `docker compose -p stack42 up -d medaris-db`) and the real Keycloak with
  `e2e-kosk-nazim`, `e2e-sistem-admin`, `e2e-medaris-nazim` and the e-mail search
  through `tedrisat-admin`: 22 of 22. The existing nizam e2e takım was run
  whole: 92 passed, 2 skipped, 2 failed — `bans.e2e.ts:291` passed again on its
  own; `shell.e2e.ts` nizam/51 needs the `e2e-medaris-nazim` account to hold a
  MEDARIS_NAZIM role in the database, which a fresh database does not have, and
  passed once that row was inserted. `madrasahs.e2e.ts` was updated: an active
  row now carries one button, nizam/22's, shut until the gate.
- The three screens were compared with the canvas PNGs at 1440 px; the 390 px
  view of Pasif kapsamlar was rendered but not compared.

## Not verified / not done

- Light/dark and Arabic (rtl) renderings were not checked in a browser.
- The permission check "a permission beyond the giver's" (403) is covered by a
  pure function only, for the reason above.
- A ders nazırı's permissions are stored and listed; nothing yet reads them to
  let that person do the work in a course.
- The imam choice for a course in nizam/14 ("müderris, imam seçimi") is not
  asked: the one assigned becomes the imam, because the course has none held.
- No scheduled job moves a medrese or a köşk to passive when a term runs out;
  Pasif kapsamlar derives the state from the roles at read time.
