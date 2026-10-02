# MDRS-168 — the Nizam shell

Screens: nizam/03 "Yönetim yetkiniz yok", nizam/31 "Başvurular", nizam/50, 51
and 52 (the phone menus of the Medaris başnazımı, the Medaris nazımı and the
köşk nazımı), nizam/57 "Talebeler" (the Başvurular tab), and Nizam's side of
medaris/16 "Çıkış yapılsın mı?". Base: `release/stack-47-yasak-temeli`. This is
the Mac lane (nizam/nazır packages); it is not linked to stack #130 until the
tedris lane (26, 29–36) is merged in.

## What was done

**libs/ui** (additive; the old shadcn files are untouched)

- `mds/scope-picker.tsx` — `ScopePicker`: the köşk in scope above the nav, a
  Base UI `Menu` of links (a plain label when there is one köşk). Written as the
  canvas's `.ekran-kapsam` box in utilities around `Avatar` and `Icon`; no new
  `.mds-*` class.
- `mds/app-shell.tsx` — `AppShell` takes `density="compact"` (the yönetim apps'
  `data-density` on `<main>`) and `<main>` grows, so a footer sits at the end of
  the page; `Sidebar` draws its `<nav>` only when it has items.
- `mds/app-providers.tsx` — `"use client"`: nizam is its first consumer from a
  server layout, and the toaster uses hooks.

**nizam-web**

- The shell: `[locale]/layout.tsx` is now `<html lang="tr" dir="ltr" data-app>`,
  loads `@medaris/ui/medaris.css` and the text faces for every page, wraps the
  app in `AppProviders` and draws `NizamShell` (server: roles, managed köşks,
  waiting-application counts) around `ShellFrame` (client: the `AppShell`,
  `Sidebar`, `AppBar` and its menu sheet from one set of `NavItem`s, the active
  item, the köşk in the path). The four per-segment layouts that loaded the
  system's CSS "until the shell moves" are gone; the old `app-layout`,
  `app-sidebar`, `nav-main`, `nav-user`, `nav-routes`, `breadcrumbs`,
  `locale-switcher` and `keycloak/login` are deleted.
- `lib/shell-nav.ts` — the menus as data, per role (başnazım = SYSTEM_ADMIN,
  Medaris nazımı, köşk nazımı, none), the role line, the current köşk, the
  active item.
- nizam/03: `[locale]/yetki-yok` (`NoRolePage`): `/` sends an account with no
  role at all here; someone who holds a role is sent back to `/`. A failed read
  of the roles shows an error Alert with "Tekrar dene" instead of claiming the
  account has none. `NIZAM__TEDRIS_URL` (`env.ts`, `.env.example`,
  `docker-compose.yml`) is where "Tedris'e dön" points; unset, the button is
  left out.
- nizam/31: `[locale]/kosks/[id]/basvurular` — table of the köşk's waiting
  applications (talebe with address, course with its müderris names, date),
  course filter, search over name and address (case- and diacritic-insensitive
  in Turkish), a count that is the visible list's length, Onayla / Reddet per row
  named "Onayla: ad, ders", only the acting row disabled, toast on success and on
  failure. Uses the existing `approve`/`reject` endpoints; no backend change.
- nizam/57: the course's Talebeler page (`…/courses/[courseId]/students`) opens
  on Başvurular (the same table, with the address as a column, the course's
  applications only); Kayıtlı and Tamamlayanlar hold the MDRS-105 roster with
  the ban windows of MDRS-177. Tab counts come from the lists.
- medaris/16, Nizam's side: `/auth/signout` is a card on its own page (outside
  the shell) with "Çıkış yap" and "Vazgeç".
- `/` for a signed-out visitor shows the welcome and a "Giriş yap" button (the
  old sidebar's login button went with the sidebar).
- i18n: `nizam.Shell`, `NoRole`, `ApplicationsPage`, `StudentsPage`,
  `SignOutPage` in tr, en and ar.
- Tests: `test/shell-nav.spec.ts`, `shell.spec.tsx`, `applications.spec.tsx`,
  `no-role.spec.tsx` (vitest); `e2e/shell.e2e.ts` with `e2e/shell-seed.ts`
  (Playwright, real API and real Keycloak sign-ins). The earlier e2e specs
  (`bans`, `archive`, `assignments`) were adjusted to the new page: the roster
  is behind the "Kayıtlı" tab, "Arşiv" now exists twice (sidebar and page),
  `[data-sidebar=sidebar]` became `aside`, and two specs seed a köşk the account
  manages, because without a role the home page now sends it to nizam/03.

## Decisions

- Every Nizam page is inside the new shell, including the old shadcn pages
  (decks, köşk list and detail, course form). They render correctly there
  (checked in a browser), but their own restyle is the later packages'.
- The launch UI is Turkish: `lang="tr"` whatever the route's locale (canvas rules
  3 and 40). The routing locales and `defaultLocale: "en"` are unchanged, so a
  bare `/` still redirects to `/en`; the locale switcher left with the sidebar.
- Menu entries point at the routes the later packages are expected to use
  (`/medreseler`, `/bildirimler`, `/kosks/:id/celseler`, …). Those that do not
  exist yet answer with the "Bu bölüm için izniniz yok" screen. "Köşk desteleri"
  points at the existing `/decks` until nizam/53 brings its own page.
- Badges: only Başvurular has a source (the pending endpoint). Notifications and
  the other counts are drawn without a badge (spec 50–52: "ilk teslimde
  rozetsiz çizilebilir"). The count is read per köşk in the layout, and
  `router.refresh()` after a decision updates it.
- The person row (`a.mds-nav-user`) goes to `/auth/signout`, with the hidden text
  ", Hesap": the account page (nizam/47) is a later package, and a sidebar with no
  way to sign out would be worse. When 47 lands, the row's `ACCOUNT_PATH`
  changes and the sign-out moves into the account page.
- nizam/31 deviations from the canvas, because the data is not there:
  the Ders column has the course and its müderris names but not the medrese or
  "imam" (the pending response has neither; spec 31 §5 says these columns stay
  empty at first), and the information box about medrese courses is not drawn
  (it would claim behaviour nothing in this package can show). "Nûruosmaniye
  Köşkü'nün" became "Bu köşkün" (a Turkish suffix cannot be added to a variable
  name).
- nizam/57: the fourth tab "Erişimi kaldırılanlar" is not drawn (tedrisat keeps no
  record of who was taken out); Kayıtlı and Tamamlayanlar are the roster's two
  states and the design's list restyle is nizam/40 and 58 (package 48).
- A talebe's "Reddet" has no window: the canvas has none and the endpoint takes no
  reason.

## Verified and not verified

- The gate, in this worktree with `--skip-nx-cache`: typecheck (17 projects),
  test (11 projects, including tedrisat's Docker suites), build (8 projects),
  lint (17) and module-boundaries (17) all green on the first run, and
  `node tools/ci/biome-ratchet.mjs` reports 0 errors, 74 warnings, 24 infos
  against baselines of 0, 74 and 24.
- nizam-web vitest: 13 files, 141 tests, green (the new specs cover the menus per
  role against the canvases' item lists, the active item, the köşk in the path,
  the filter / search / count / sort, the refusal sentences, the table markup and
  the no-role screen).
- Playwright against the running API and real Keycloak sign-ins
  (`e2e/shell.e2e.ts`, plus the earlier nizam specs): 30 passed, 2 skipped (not
  examined), 0 failed. Per screen:
  - nizam/03: criteria 1–5 (an e2e-talebe lands on `/tr/yetki-yok`; no `nav`;
    its own e-mail; the title, the h1 and the focus; "Tedris'e dön" leaves for
    the configured address, answer faked; signed out it goes to sign-in).
  - nizam/31: criteria 1–6 (five seeded applications, the count, the filter, the
    search for "omer" finding "Ömer", Onayla → `ENROLLED` in the database and the
    badge 5 → 4 without a reload, Reddet → row deleted, another köşk's page is
    "Bu bölüm için izniniz yok").
  - nizam/57: criteria 1, 2 and 4 (opens on Başvurular with the course's rows
    only, Onayla moves the talebe to the Kayıtlı count, Talebeler selected in
    the sidebar); 3 is the same Reddet as nizam/31's.
  - nizam/50, 51, 52 at 390 × 844: criteria 1–4 and 6 for all three (the sheet's
    groups and items in the canvas's order, no "Çıkış yap", Esc closes, focus
    opens in the head row, a followed link goes there and closes the sheet);
    criterion 5 (768 closes the sheet) for nizam/52.
  - medaris/16: "Vazgeç" keeps the session; "Çıkış yap" ends the Keycloak
    session and a protected page asks for sign-in again.
- Looked at in a browser against the canvases' PNGs: 03, 16, 31, 50, 52, 57.

## Not verified

- Arabic and right-to-left rendering of the shell (`dir="ltr"` is fixed at launch);
  the dark theme; Safari and Firefox; a real phone (the 390 px screens were
  driven in Playwright Chromium).
- nizam/03 criterion 3 follows `NIZAM__TEDRIS_URL`; the e2e checks the click
  goes to that address with the answer faked, not a running Tedris.
- nizam/57 criterion 5 (a non-owner gets 404/403 and the page shows an error
  state): not run. The page shows "Bu dersin kayıtları şu anda okunamadı." when
  the roster read fails; whether tedrisat answers a non-member with 403 for it
  was not exercised.
- nizam/50 and 51 criterion 5 (768 closes the sheet) and 51's list were checked
  for the list only; the 768 behaviour is the kit's and was driven for 52.
- The sidebar badge after a decision was checked for Başvurular only.
- The badge for notifications, and every menu entry whose page does not exist
  yet, are not testable here.
- `drizzle-kit migrate` exited 1 without a message against the shared local
  database; migration `0030_bans` was applied to it by replaying the journal
  from a script. No migration is part of this package.
- tedrisat's rate limit (100 requests a minute per client address) is reached by
  the whole e2e run now that every page load reads the roles; the e2e run used
  `API__THROTTLE_LIMIT=2000`. The shell's reads per full page load: roles (2),
  managed köşks (1) and one pending list per köşk for a köşk nazımı.
