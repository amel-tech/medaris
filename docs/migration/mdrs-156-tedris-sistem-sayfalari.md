# MDRS-156 — tedris system pages

Package 26 of the screen-canvas plan: the sign-out confirmation (design
`medaris/16`), the application window (`tedris/07`), the draft preview
(`tedris/14`) and the 404, 403 and error pages (`tedris/38`, `39`, `40`). All six
are class A: no backend endpoint, no migration. The base is
`release/stack-25-giris-keycloak`.

## What was done

Sign-out (`medaris/16`)

- `/auth/signout` (it already existed since MDRS-101, in the shadcn kit) is now
  the card of the design on the unified kit: logo, "Çıkış yapılsın mı?", the
  sentence, "Çıkış yap" (busy state with the spinner while `keycloakSignOut`
  navigates away) and "Vazgeç" (`router.back()`, or `/<locale>/home` when the
  tab has no history). The segment loads `medaris.css` and the faces.
- The user menu's "Çıkış yap" is now a link to this page instead of signing out
  on a click (acceptance criterion 4, "one confirmation, in the app"). The Turkish
  label was "oturumu Kapat" and is now "Çıkış yap", the design's word.
- Nizam has the same page request (the spec's route list names both apps) but the
  package's Nx project is `tedris-web`; nizam was not touched.

Application window (`tedris/07`)

- `EnrollmentReceivedDialog` on the kit's `Dialog`: the course's name in capitals
  over "Başvurun alındı" (`toLocaleUpperCase(locale)`, so Turkish `i` becomes `İ`),
  two paragraphs, "Tamam", focus opens on "Tamam" (the kit's `Button` now takes a
  `ref` for `initialFocus`). The course page opens it when `POST /courses/:id/enroll`
  answers `PENDING`; an immediate enrollment keeps its toast. A refused
  application opens nothing (the existing error toast).
- After "Tamam" (or Esc) focus goes to "Başvuruyu geri çek" (`#withdraw-request`)
  once the refresh has drawn it.

Draft preview (`tedris/14`)

- `CoursePage` shows a DRAFT course as a preview: an info `Alert` ("Önizleme"),
  a "Taslak" badge, and in place of the enroll card a preview card ("Ders
  yayımlandığında", the earliest `scheduledAt` as "İLK CELSE 12 Ekim Pazartesi
  21:00" in the course's zone, and "Düzenlemeye dön"). There is no application
  button. The API already answers a draft only to callers who may edit it, and
  404 to everyone else, which is what the page relies on.
- "Düzenlemeye dön" goes to `TEDRIS__NAZIR_URL` (the same value the account page
  uses); it is left out when that is unset. The Nazır app has no course route yet
  (`apps/nazir` is a stub), so the target is the app's address, not a course.
- The segment `courses/[courseId]` now loads `medaris.css`. That stylesheet's
  Tailwind build has no `lg:`/`sm:` and re-emits plain utilities after the app's,
  which flattened the page's two-column grids; they are written as a plain wide
  layout narrowed by `max-[1023px]:` / `max-[639px]:`, which both builds emit.

System pages (`tedris/38`, `39`, `40`)

- `features/errors/system-page.tsx`: `NotFoundState`, `ForbiddenState`,
  `ErrorState` on the kit's `SystemState` (inside the shell, so a `<section>`),
  with the system's stylesheet and faces (a boundary replaces its segment, so the
  segment layouts' copies are not around it).
- `app/[locale]/not-found.tsx` and a `[...rest]` catch-all that calls
  `notFound()`, so an unknown URL answers 404 with the shell around it;
  `app/not-found.tsx` for a URL whose locale prefix is not supported (its own
  `<html>`, Turkish text). The medrese and session pages' temporary not-found
  files (and their `notFound*` keys) are removed: they fall onto the shared page.
- `app/[locale]/error.tsx`: shows `ErrorState`, logs the digest only; "Yeniden
  dene" runs `router.refresh()` and `reset()` together (a server component that
  threw has to be read again). `app/global-error.tsx` for a shell that threw.
- `getCourse` used to turn every failure into `null`, so an API that was down
  rendered the 404 page. It now returns `null` only for the API's own answers
  about the course (400, 401, 403, 404) and rethrows anything else, so those go
  to the error page.
- 39: `/decks/:id/cards` and `/decks/:id/edit` show `ForbiddenState` (naming the
  deck, "Desteye dön") to a caller who can read the deck but is not its author.
  `/edit` was a stub that printed "Edit"; the author is now sent on to the deck
  page, where its details are edited.

i18n: `tedris.json` in tr, en and ar gets `SystemPages`, the `CoursePage`
window/preview keys and the new `Auth` sign-out strings (the en and ar
translations are mine and unreviewed).

## What was verified

All against the dev Keycloak with the `e2e-*` accounts, tedrisat on the shared
local Postgres (127.0.0.1:5433) and `tedris-web` in `next dev`:

- `pnpm nx run tedris-web:test:e2e` for `e2e/system-pages.e2e.ts`: 11 of 11 pass.
  Sign-out from the user menu, "Vazgeç" keeps the session, "Çıkış yap" ends it
  and the account page asks for sign-in again; the window opens with the
  capitalised course name, focus on "Tamam", Esc and "Tamam" close it, focus goes
  to "Başvuruyu geri çek"; a refused application opens no window; the preview
  banner, badge, card, no application button, earliest session and the Nazır
  link; the not-found state for a talebe on a draft; 404 for an unknown URL and an
  unknown course id; 403 state on `/edit` and `/cards` of someone else's public
  deck; the error page for a segment that throws, no detail shown, and "Yeniden
  dene" reading again after the data was fixed.
- Screenshots of the sign-out card, the window, the preview and the 403 page were
  compared with the canvas by eye.
- `pnpm nx run-many -t typecheck|test|build|lint|module-boundaries --skip-nx-cache`
  and `node tools/ci/biome-ratchet.mjs`: green.
- New unit specs: `preview`, `course-preview-page`, `enrollment-received-dialog`,
  `sign-out-confirm`, `system-pages`, `get-course` (the dialog and the pages in
  happy-dom, which tedris-web now declares as a dev dependency like `libs/ui`).

## What was not verified

- The error test seeds a course whose time zone no calendar knows, because an API
  that is down cannot be stopped from a spec. It exercises the error boundary and
  the retry, not an unreachable API; `getCourse`'s rethrow for network errors and
  5xx is covered by `get-course.spec.ts` only.
- The dev overlay of `next dev` shows error detail; "no detail to the user"
  (criterion 3 of tedris/40) was asserted on the page's own region, and was not
  looked at in a production build.
- 404 for a signed-out visitor: the middleware sends every non-public URL to sign
  in first, so a signed-out visitor on an unknown URL sees the sign-in page, not
  the not-found state with a signed-out top bar. Signed-out rendering of the page
  is covered by `system-pages.spec.ts` (the home link goes to `/`) only.
- Nizam's sign-out page, the top bar of the designs (the app bar is not on the
  unified shell yet, the old header renders above these pages) and the Arabic/RTL
  look were not done or checked.
- Clicking the focus hand-back in a production build, and the application window's
  scrim-click behaviour (rule 20 leaves it open; it closes on the scrim, as the kit
  default for a reader dialog).
- `e2e/account.e2e.ts` fails two specs on this database (4 role rows where it
  expects 3, 2 where it expects 1) because `local_docs/keycloak/e2e-tohum.sql`
  gave the same accounts extra roles; unrelated to this package, not changed.
