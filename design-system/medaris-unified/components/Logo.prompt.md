The Medaris mark: two arch halves on a rounded lâciverd ground, the geometry the apps already use (libs/icons `MadrasahLogoIcon`). The wordmark goes beside it where the app has no other name on screen. One mark for every app.

```jsx
<Logo app="nizam" wordmark />          {/* the sidebar: mark, "Medaris", "NİZAM" */}
<Logo app="tedris" size="sm" />        {/* the AppBar */}
<Logo size="lg" wordmark />            {/* the sign-in card and the landing page: mark, "Medaris", مدارس */}
```

## Anatomy (HTML)

```html
<span class="mds-logo" role="img" aria-label="Medaris — Nizam">
  <svg class="mds-logo__mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <rect class="mds-logo__ground" width="48" height="48" rx="12"/>
    <g class="mds-logo__arch" filter="url(#mds-logo-arch-1)"><path d="…"/><path d="…"/></g>
    <defs><filter id="mds-logo-arch-1" …>…</filter></defs>
  </svg>
  <span class="mds-logo__text">
    <span class="mds-logo__word" lang="en" dir="ltr">Medaris</span>
    <span class="mds-logo__subtitle" dir="auto">Nizam</span>
  </span>
</span>

<!-- lg lockup: مدارس under the wordmark, as outlined paths (assets/logo-arabic.svg) -->
<span class="mds-logo mds-logo--lg" role="img" aria-label="Medaris">
  <svg class="mds-logo__mark" …>…</svg>
  <span class="mds-logo__text">
    <span class="mds-logo__word" lang="en" dir="ltr">Medaris</span>
    <svg class="mds-logo__arabic" viewBox="68 -677 2527 932" aria-hidden="true" focusable="false"><path d="…"/></svg>
  </span>
</span>
```

The mark is `assets/logo-mark.svg`: markup to inline inside `.mds-logo`, with the full paths and filter. It takes its colours from the class layer, so an `<img>` of it, a favicon or a CSS background is a black square. It has two parts:

- `.mds-logo__ground`: a 48 square with `rx` 12, filled `--icon-logo-ground` (lâciverd-700).
- `.mds-logo__arch`: the two arch halves, filled `--icon-logo-arch` (lâciverd-50), with the faint inner shadow of the original. The filter id must be unique in its document: `Logo` takes one from `React.useId`; inline copies number theirs.

Sizes: `sm` 24 (the AppBar), `md` 32 (the sidebar), `lg` 48 (sign-in, landing). `md` takes no size class. The wordmark is Literata 600: 16 at `sm`, 18 at `md`, 24 at `lg`. It is a Latin island (`lang="en" dir="ltr"`), so it keeps its face and size on an Arabic page. `.mds-logo__subtitle` is a 12px uppercase eyebrow in `--text-neutral-subtle`.

`app` gives the default subtitle: Tedris, Nizam, Nazır, Giriş, and none for the landing page. `subtitle` replaces it. At `lg` the lockup's second line is مدارس (`.mds-logo__arabic`, 18px tall, `--text-neutral-muted`), and no subtitle is drawn unless the caller passes one. The Arabic word is paths, not text, so a Latin-only page never loads the Naskh file for it. `.mds-logo__text` is present only with `wordmark`.

## States

None. A logo keeps its colours, so the mark is the same in both themes. The arch is 8.18:1 on its ground; the ground is 8.70:1 on the day page and 1.94:1 on the night page, where the arch carries the mark (`contrast.md`, "Not required": a logo is exempt). There is no inverse variant.

## A11y contract

- The root is `role="img"`, named "Medaris" or "Medaris — {subtitle}". The mark, the wordmark and مدارس inside it are not read separately.
- Inside a link home, the link takes its name from the logo; do not add a second label.
- Forced colours: the ground is `CanvasText`; the arch is `Canvas`; مدارس is `CanvasText`.

## Rules

MDS-COL-01, MDS-TOK-01, MDS-TYPE-01, MDS-TYPE-04, MDS-TYPE-07, MDS-A11Y-04, MDS-A11Y-08, MDS-COMP-01, MDS-LAY-05, MDS-COL-09, MDS-SHAPE-04, MDS-TOK-07.

- The wordmark says **Medaris** and nothing else; the app's name goes in `subtitle`.
- Never redraw, recolour, rotate or crop the mark, and never build a second mark per app. Its colours are the two `--icon-logo-*` domain tokens; it names no primitive and no literal colour.
- Place it at the top inline-start of the sidebar or the AppBar, and above the form on the sign-in card.
- The `lg` lockup with مدارس is only for the sign-in card and the landing page.
- The Nazır display name follows the readme's spelling.
