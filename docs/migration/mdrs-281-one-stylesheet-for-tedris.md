# MDRS-281 — One stylesheet for tedris, so no Tailwind build shadows another

Found while laying out the recordings tab (MDRS-280): on a phone the tab's `max-lg:grid-cols-1` did
nothing, and the player was a 32 px sliver. The owner's answer was to separate the two stylesheets at the
root, in the same PR. This note says why they clashed, which pages it really broke, what the pipeline is
now, and how that was checked. Every number below was read off a command's output or a screenshot.

## What was wrong

tedris renders two kits side by side while its pages move to the unified design system: the shadcn kit
(the header menus, the toasts, a few forms, the `/welcome` page) and the system. It loaded:

- `@medaris/ui/globals.css` in the locale layout, on every page: Tailwind with its default theme and
  breakpoints (`sm`, `md`, `lg`, `xl`, `2xl`), the kit's theme and tokens, its preflight;
- `@medaris/ui/medaris.css` again in each segment on the system (the course, session, account, auth and
  notification layouts, `MedarisAssets` for the medrese, köşk, home, Keşfet, Derslerim, Program and decks
  segments, and the error and not-found boundaries): a second Tailwind build, with the system's theme,
  whose `libs/tokens/tailwind.css` turns Tailwind's scales off and keeps one breakpoint, `md` (MDS-TOK-01,
  MDS-LAY-04).

Both builds scan every app's source, so both declared most utility classes. Compiled the way `next build`
does, they declared 512 utility classes twice. On a page that loads both, the second sheet's copy comes
later in the same `utilities` layer and wins. So wherever an element carried a plain class and a
breakpoint variant only the kit's sheet knew (`lg:`, `max-lg:`, `sm:`, …), the plain class won:

| Page | Classes | Before (measured) | After |
| --- | --- | --- | --- |
| Desteler, `/tr/decks` | `grid-cols-3 max-lg:grid-cols-2 max-md:grid-cols-1` | 3 columns at 768 (should be 2) | 2 columns at 768, 3 at 1180, 1 at 390 |
| Desteleri keşfet, `/tr/decks/explore` | the same | 3 columns at 768; the cards so narrow that "Koleksiyona ekle" ran out of its card and the page was 798 px wide | 2 columns at 768, the page 774 px wide like every other page at 768 |
| the recordings tab before MDRS-280 | `grid-cols-[minmax(0,1fr)_minmax(0,24rem)] max-lg:grid-cols-1` | two columns at 390: a 32x18 px player | (MDRS-280 no longer uses a breakpoint there) |
| Hesap, `/tr/account` | `lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]`, `sm:grid-cols-2` | worked: 1 / 2 columns at 768, 2 / 2 at 1180 | the same |
| Köşk başvurusu, `/tr/kosk-applications/new` | the same two, and a second `sm:grid-cols-2` | worked, as above | the same |
| the public profile | `lg:grid-cols-[…]` | not reachable: `PUBLIC_PROFILE_ENABLED` is false, the page is the not-found page | not checked |

The account and köşk application pages were not broken because no class on those elements set the same
property in the system's sheet; the decks pages were, because `grid-cols-3` was in both.

## What the pipeline is now

One Tailwind build for the app, and the system's CSS without Tailwind beside it:

| File | What it is |
| --- | --- |
| `apps/tedris/app/tedris.css` (new) | tedris's one stylesheet, imported once by `app/[locale]/layout.tsx`. It writes the layer order, then imports the kit (`@medaris/ui/globals.css`: Tailwind, the kit's theme, its preflight and base), the system without Tailwind (`@medaris/ui/medaris-components.css`), and the system's role names (`@medaris/tokens/tailwind-roles.css`) last, so the one build knows both kits' utilities and a name both define means what the system says |
| `libs/ui/src/styles/medaris-components.css` (new, exported as `@medaris/ui/medaris-components.css`) | `medaris.css` less Tailwind: the tokens with the element defaults and type classes in their own `mds-base` layer, the class layer and the Base UI twins in `components` |
| `libs/tokens/tailwind-scales.css`, `libs/tokens/tailwind-roles.css` (new; `tailwind-roles.css` exported) | `tailwind.css` split in two: the `initial` resets and the one breakpoint, and the role names. `tailwind.css` imports both, in that order, so `medaris.css` is unchanged: compiled for nazar it is byte-identical before and after (`cmp`, 180,036 bytes) |
| the segment layouts, `MedarisAssets`, `SystemPageAssets` | no longer import `medaris.css`; they still load the system's faces |
| `app/not-found.tsx`, `app/global-error.tsx` | unchanged: standalone documents drawn without the locale layout, each loading `medaris.css` alone |
| `biome.json` | skips the two new `@theme` files, as it skips `tailwind.css` (Biome cannot parse `@theme inline reference`) |

The layer order, `theme, base, mds-base, components, utilities`, is written at the top of both `tedris.css`
and `medaris-components.css`, so it holds whichever the browser reads first: the kit's preflight and base,
then the system's element defaults, then the class layer, then the one set of utilities over all of them.
Read in the build: the locale pages link two files, the 2 KB `next/font` face for Inter and the 191 KB
stylesheet; `medaris.css`'s chunk is linked only by the two standalone documents.

## Who sees a difference

Every page was screenshotted before and after at 390, 768 and 1180 px, and each pair compared pixel by
pixel (a pixel counts as changed when its colour moves by more than 30 in total):

| Page | Changed pixels | What changed |
| --- | --- | --- |
| Hesap, Köşk başvurusu, Keşfet, Bildirimler, the not-found page | 0.00 % at every width | nothing |
| Ana sayfa, Derslerim, Program, the course page (Müfredat and Ders kayıtları), the session page, a deck's page | 0.00 to 0.47 % | only the times relative to now and the decks' random seed tags, which differ between the two runs (the course, session and home pages looked at as difference images) |
| Desteler, Desteleri keşfet | 0.3 to 8.8 % | the grids above at 768; at 390 and 1180 only the random tags (at 1180 one deck title wraps differently with its tag and moves what is under it by 10 px; looked at as a difference image) |
| `/welcome` | 97 to 98 % | the system's element defaults: the paper ground instead of white, the Literata heading, the system's link colour in the old header's tabs |

`/welcome` is the last page on the kit alone. It used to load no system CSS; it now gets the system's
element defaults with the rest of the app. Its own classes, the kit's button and header, are as they were.

## Decided by default, owner may overrule

1. **One build in the app's own entry**, not a change to `@medaris/ui/globals.css`: nizam also loads that
   file, and its pages could not be checked here (below).
2. **The system's names win where both define one** (`font-medium`, `font-semibold`, `text-caption`,
   `text-body`, `text-body-sm`, the error/info/success/warning grounds, `text-neutral-disabled`): the
   value every page on the system already had, because the system's sheet came later. The kit's weights
   are the system's in Latin text; the system's are a step heavier in Arabic.
3. **The system's element defaults load on every page**, `/welcome` included, rather than per segment:
   one stylesheet, nothing to order, and the variables the role names use are always there.

## Tests

- `apps/tedris/test/stylesheets.spec.ts` (new): it reads the stylesheets every source file under the
  locale layout imports, compiles each with PostCSS and `@tailwindcss/postcss` (as `next build` does), and
  asks that only one of them builds utilities, that no two declare the same utility (listing first the
  breakpoint variants whose plain class is declared again), that every breakpoint utility in the app's
  code (24 of them) is built, that the sheets and `medaris-components.css` write one layer order, and that
  each standalone document loads one sheet. On the branch: `Tests 5 passed (5)`. With the eight changed
  layout and asset files put back to the old imports: `Tests 3 failed | 2 passed (5)`; the shadowing
  test reports 512 classes declared twice and 19 breakpoint variants shadowed, among them
  `max-lg:grid-cols-2`, `lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]` and `sm:grid-cols-2`.
- `libs/ui/test/medaris-components-css.spec.ts` (new): `medaris-components.css` brings the tokens and
  every class-layer file `medaris.css` brings, no Tailwind, and the `mds-base` layer: `Tests 3 passed (3)`.
- Suites: `libs/tokens` `Tests 29 passed (29)`, `libs/ui` `Tests 167 passed (167)`, `apps/tedris`
  `Tests 854 passed (854)` (with MDRS-280's round 2); `biome-ratchet` 0 / 70 / 21.
- The five tedris browser specs listed in `mdrs-280-player-and-notes-layout.md` pass on the build with
  this change.

## The other apps

- **nazar** and **landing** load `medaris.css` alone: one build, no clash. `medaris.css` compiles to the
  same bytes as before for nazar.
- **nizam** loads `globals.css` and `medaris.css` together in its locale layout, the same clash, and its
  code uses `sm:` and `lg:` 62 times (the köşk pages' loading skeletons, among others). It is not changed
  here: the fix would be its own entry like `tedris.css`, but its pages could not be checked with
  screenshots on this machine (nizam signs in only through its own Keycloak client, on port 4001, which
  was not mine to use).

## Not verified

- nizam, above.
- The public profile page (hidden by its flag).
- Dark theme, the Arabic pages, browsers other than Chromium.
