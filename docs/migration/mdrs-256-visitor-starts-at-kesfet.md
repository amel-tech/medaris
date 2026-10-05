# MDRS-256: a visitor starts at Keşfet

A visitor who was not signed in opened tedris, landed on Ana sayfa (`/home`) and saw a page with the word
"Ev" and nothing else: `home/page.tsx` drew the `TabView.home` string as a placeholder for the visitor. Everything
the real Ana sayfa draws (the greeting, the coming sessions, "devam et", the followed decks) is personal, so there
was nothing to put there. The visitor's pitch is the landing site's, and Keşfet (`/discover`) is open to a visitor.
No migration, no API change.

## What changed

- `app/[locale]/page.tsx` (`/`): a signed-in caller is sent to `/home` as before, a visitor to `/discover`.
- `app/[locale]/home/page.tsx`: a visitor who asks for `/home` is redirected to `/discover` in their locale
  instead of getting the placeholder. The page stays `force-dynamic` (it reads the sign-in) and `/home` stays in
  `publicPages`, so the middleware lets the visitor reach the redirect instead of bouncing them to sign in.
- `components/phone-menu/desktop-bar.tsx`: a visitor's bar is Keşfet, then Giriş yap and Kayıt ol; no Ana sayfa
  item, and the wordmark opens Keşfet. A signed-in bar is unchanged.
- `components/phone-menu/phone-menu.tsx` (the visitor's phone menu, design tedris/45): the sheet holds Keşfet and
  the two buttons; the bar's title is "Keşfet". `isHomePath` is gone with its only two users.
- The legacy `TabView` already left Ana sayfa out for a visitor.

## Behaviour changes the owner will notice

1. `/`, `/tr` and `/tr/home` end on `/tr/discover` for someone who is not signed in. The system pages' "back home" button already sent a visitor to `/<locale>`, which now ends there too.
2. A visitor's top bar and phone menu have no "Ana sayfa".
3. The design canvases tedris/45 and the desktop bar show Ana sayfa for a visitor; they now disagree with the
   app on purpose (the owner's decision, 5 October). A designed signed-out home would replace the redirect.

## Tests, and what each fails without

Run with `NODE_OPTIONS=--no-experimental-webstorage` (Node 26 on this machine has no `localStorage.clear`).

| Criterion | Test | Without the change |
| --- | --- | --- |
| `/` sends a visitor to Keşfet and a signed-in caller to `/home` | `test/visitor-start.spec.ts` | fails: 2 of 3 |
| `/home` sends a visitor to Keşfet and a signed-in caller still gets the page | same spec | fails (counted above) |
| the visitor's phone menu holds Keşfet alone and marks it | `test/anonymous-read.spec.ts`, two tests | fails: 2 |
| the desktop bar draws Ana sayfa for a member and not for a visitor, wordmark opens Keşfet | `test/desktop-bar.spec.ts` | fails: 1 |
| the same through a browser | `e2e/anonymous.e2e.ts` ("where a visitor starts", the phone menu sheet) | not run (needs the dev stack; the anonymous specs need no sign-in) |

The five tests above fail together when the four source files are put back to `origin/main` (5 failed, 21 passed
in the three spec files) and pass with the change (26 passed). The whole tedris vitest suite passes (78 files, 736
tests).

## Not verified

- The Playwright specs were edited and not run.
- Where signing out lands was not read or changed here; if it goes through `/` or `/home` it now ends on Keşfet.
