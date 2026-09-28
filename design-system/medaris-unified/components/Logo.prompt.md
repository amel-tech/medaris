The Medaris mark, with the wordmark where the app has no other name on screen. One mark for every app.

```jsx
<Logo app="nizam" wordmark inverse />
<Logo app="tedris" size="sm" />
<Logo app="giris" size="lg" wordmark />
```

## Anatomy (HTML)

```html
<span class="mds-logo mds-logo--inverse" role="img" aria-label="Medaris — Nizam">
  <svg class="mds-logo__mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <rect class="mds-logo__ground" width="48" height="48" rx="12"/>
    <g class="mds-logo__arch" filter="url(#mds-logo-r1)"><path d="…"/><path d="…"/></g>
    <defs><filter id="mds-logo-r1" …>…</filter></defs>
  </svg>
  <span class="mds-logo__text">
    <span class="mds-logo__word">Medaris</span>
    <span class="mds-logo__subtitle" dir="auto">Nizam</span>
  </span>
</span>
```

The geometry is the live apps' mark (`libs/icons` MadrasahLogoIcon), the same as `assets/logo-mark.svg`: a 48 box, `rx` 12, two arch halves with a soft inner shadow. The filter id is per instance (`React.useId`), so two logos on a page never share one. Sizes: `sm` 24 (AppBar), `md` 32 (sidebar), `lg` 48 (sign-in card); `md` takes no size class. `app` gives the default subtitle — Tedris, Nizam, Nazır, Giriş; none for the landing page — and `subtitle` replaces it. `.mds-logo__text` is present only with `wordmark`.

## States

None. `inverse` is a surface, not a state: on the dark sidebar the wordmark is `--text-white` and the subtitle `--text-neutral-inverse-tertiary`. The mark never changes.

## A11y contract

- The root is `role="img"` named "Medaris", or "Medaris — {subtitle}"; the mark and the wordmark inside it are not read separately.
- Inside a link home, the link takes its name from the logo; do not add a second label.
- Forced colours: the mark keeps its own colours (`forced-color-adjust: none` on the mark only); the wordmark follows the system's text colour.

## Rules

MDS-TOK-01, MDS-TYPE-01, MDS-TYPE-07, MDS-COL-01, MDS-A11Y-04, MDS-A11Y-08, MDS-COMP-01.

- The wordmark says **Medaris** and nothing else; the app's name goes in `subtitle`.
- Never redraw, recolour, rotate or crop the mark, and never build a second mark per app.
- Top inline-start of the sidebar or the AppBar; on the sign-in card above the form.
- The two asset colours `#004F80` / `#DEE8FF` are the only literals in the class layer, pending SPEC-D3-02. `#004F80` measures 2.07:1 on the slate-900 sidebar, so the mark's ground barely separates from it; the arch (7.03:1 on the ground) is what reads. SPEC-D3-02 option (d) recolours the mark to sky-900 / sky-100.
- The Nazır display name is SPEC-D3-12; `app="nazir"` follows the readme's spelling until it is decided.

## From #95

`pr95-migration/pr95-map.json#components.Logo`
