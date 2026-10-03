# MDRS-160: reading with no account (tedris/09, 10, 11, 45)

Package 30 of the screen canvas. The pages a visitor with no account reads before deciding to sign in: Keşfet, a köşk, a medrese, and the phone menu. Most of the API side already existed (MDRS-122 opened the köşk, medrese and course reads to a caller with no token); this package adds the missing pieces on both sides.

## What was done

API (`tedrisat`, no migration)

- No `/public/...` routes. The canvas planned `GET /public/kosks`, `/public/kosks/:id(/courses)` and `/public/madrasahs(/:id)`, but `GET /kosks`, `/kosks/:id`, `/kosks/:id/courses`, `/madrasahs`, `/madrasahs/:id` and `/madrasahs/:id/overview` are already `@AuthzPublic()` and already hide unlisted köşks, drafts and hidden courses (MDRS-122, `public-pages.e2e.spec.ts`). A second set of routes would be a second copy of the same rule.
- `KoskResponse.managerName`: the name of the köşk's oldest KOSK_NAZIM holder (given and family name from `users`), for the "Köşk nazımı …" line. Null when that person has no name on file. Same for every caller.
- Masking for a caller with no token, applied in the controllers: a köşk's `ownerId` is `null` and `managerIds` is `[]`; a medrese's `createdBy` is `null` and `nazirIds` is `[]` (`kosk/anonymous-mask.ts`, `madrasah/anonymous-mask.ts`). A signed-in caller gets the ids as before. `ownerId` and `createdBy` became nullable in the OpenAPI document; nothing in the web apps reads them.
- The tedrisat client was regenerated (`pnpm run openapi:tedrisat`).

tedris-web

- `/discover` is open to a visitor (`publicPages`). For a visitor the cards have no follow button, the medreses that have opened no course are left out (the count line follows), and the page ends with "Bir derse başvurmak için giriş yap ya da kayıt ol. …" in place of the köşk-application card.
- The köşk page shows "Köşk nazımı {name}" and, to a visitor, the invitation under the courses. The medrese page shows the invitation to a visitor, and its breadcrumb now leads to `/discover` (it led to `/home` while Keşfet was closed).
- The invitation (`components/anonymous-invite.tsx`) is one rich message with two links: sign-in comes back to the page the visitor was on (`callbackUrl`), registration is the app's `/auth/register`, which always ends on `/start`.
- Phone menu for a visitor (`components/phone-menu/`): the kit's `AppBar` with Ana sayfa and Keşfet in the sheet and Giriş yap / Kayıt ol at its foot; mounted by the layouts of `/discover`, `/kosks` and `/madrasahs` (the segments that load the system's stylesheet) for a signed-out visitor only.
- i18n (tr, en, ar): `AnonymousInvite`, `PhoneMenu`, `KoskPage.manager`.

## What was verified

Run on this branch, against a local Postgres (:5433), tedrisat and tedris-web in dev.

- Gate, all with `--skip-nx-cache`: typecheck, test, build, lint and module-boundaries green; `node tools/ci/biome-ratchet.mjs` below its baseline (74 to 72 warnings, 24 to 23 infos; the baseline file was not lowered). Test counts from each project's JUnit report: tedrisat 998, tedris-web 233, ui 102, no failures.
- tedrisat e2e `public-pages.e2e.spec.ts`: 30 tests, 4 new for the masking and `managerName`.
- tedris-web unit `test/anonymous-read.spec.ts` (18): which paths are public, no follow button, the invitation's links, empty medreses left out, the manager line, the medrese page, the phone menu's items, active page, foot and bar.
- Playwright `e2e/anonymous.e2e.ts` (25), cookie-less context against the real API and DB, including: Keşfet 200 with cards and no `Takip` button; "3 köşk ve 1 medrese" with the empty medrese hidden; card to köşk page; "giriş yap" and "kayıt ol" end on a `/realms/` URL; `giriş yap` returns to `/tr/discover` after a real Keycloak login as `e2e-talebe` (and the follow button is back); köşk page with manager, published courses only, no decks; medrese page with no badge; 404s; API answers; at 390 px the sheet opens, holds focus, closes on Escape and returns focus, is not drawn at 800 px and closes when widened, and the old header is hidden.
- Screenshots of Keşfet, the köşk page and the open sheet compared with the canvas by eye.

## What was not verified, or differs from the canvas

- Desktop top bar. The canvas draws the new top bar (Ana sayfa, Keşfet, Giriş yap, Kayıt ol); the app's shell has not moved to the unified system (no package plans it), so desktop keeps the old header, and below 768 the old header gives way to the phone bar for a visitor only. The signed-in phone menu is tedris/44, package 33.
- "Köşk nazımı" was verified in the browser only on a fixture köşk with a manager; the shared demo DB has no KOSK_NAZIM on the Nûruosmaniye köşk, so the line is absent there.
- `isPrivate` köşks stay out of every list for everyone (MDRS-122), so the open question in the tedris/09 spec (show unlisted köşks to a visitor?) is answered "no" by the existing rule.
- The overview (`GET /madrasahs/:id/overview`) and the course summaries still carry müderris and başmüderris ids for a caller with no token; only the köşk and medrese resources were masked. Not changed: the pages show names, and the ids are not in the canvas's scope for this package.
- `discover.e2e.ts` (signed-in): two specs (`pages the köşks`, `completion date`) failed once in a full run and passed on rerun (a hidden streaming copy of the page makes a locator match twice); `an unknown köşk answers 404` fails with 200 on the unmodified base too (the streamed page has sent its status before `notFound()`). The new spec asserts the not-found text instead of the status.
- The `.env` check `grep -c set-me-per-machine .env` prints 1: the one match is the commented-out `TEDRISAT__KEYCLOAK_ADMIN_CLIENT_SECRET` line of `.env.example`, not a value the apps read.
