The compact chrome below 768: a 56px paper bar with the menu button, the mark, the page's name and at most two actions. The menu opens the nav sheet. At 768 and up the bar is not drawn.

```jsx
<AppBar
  title="Dersler"
  logo={<Logo app="nizam" size="sm" />}
  actions={<IconButton icon={<Icon name="bell" />} label="Bildirimler" size="large" variant="ghost" />}
  footer={
    <a className="mds-nav-user" href="/ayarlar">
      <Avatar name="Abdülhamit Karaosmanoğlu" size="sm" decorative />
      <span className="mds-nav-user__text">
        <span className="mds-nav-user__name"><bdi>Abdülhamit Karaosmanoğlu</bdi></span>
        <span className="mds-nav-user__role">Müderris<span className="mds-visually-hidden">, ayarlar</span></span>
      </span>
      <Icon name="chevronRight" size="sm" />
    </a>
  }
>
  <NavSection>Köşk</NavSection>
  <NavItem href="/dersler" count={7} active>Dersler</NavItem>
  <NavItem href="/celseler" count={2} countLabel="bağlantısı eksik">Celseler</NavItem>
</AppBar>
```

## Anatomy (HTML)

```html
<header class="mds-appbar">
  <button type="button" class="mds-btn mds-icon-btn mds-btn--large mds-btn--ghost mds-appbar__menu"
          aria-label="Menü" aria-haspopup="dialog" aria-expanded="false" aria-controls="nav-sheet">
    <span class="mds-appbar__menu-icon" aria-hidden="true"></span>
  </button>
  <span class="mds-logo mds-logo--sm" role="img" aria-label="Medaris — Nizam">…</span>
  <p class="mds-appbar__title" dir="auto">Dersler</p>
  <div class="mds-appbar__actions">…</div>
</header>
<dialog class="mds-sheet" id="nav-sheet" aria-label="Ana menü">
  <div class="mds-sheet__body">
    <div class="mds-sheet__head">
      <span class="mds-logo mds-logo--sm" role="img" aria-label="Medaris — Nizam">…</span>
      <button type="button" class="mds-btn mds-icon-btn mds-btn--regular mds-btn--ghost mds-sheet__close" aria-label="Kapat">
        <span class="mds-sheet__close-icon" aria-hidden="true"></span>
      </button>
    </div>
    <nav aria-label="Ana menü">…NavSection and NavItem markup…</nav>
    <div class="mds-sheet__foot">
      <a class="mds-nav-user" href="/ayarlar">
        <span class="mds-avatar mds-avatar--sm" aria-hidden="true">AK</span>
        <span class="mds-nav-user__text">
          <span class="mds-nav-user__name"><bdi>Abdülhamit Karaosmanoğlu</bdi></span>
          <span class="mds-nav-user__role">Müderris<span class="mds-visually-hidden">, ayarlar</span></span>
        </span>
        <svg class="mds-icon mds-icon--sm mds-icon--directional" aria-hidden="true">…</svg>
      </a>
    </div>
  </div>
</dialog>
```

AppBar draws the bar, the sheet and the sheet's `<nav>`. The caller passes the Logo and the NavItems; AppBar never references them itself. `footer` sits at the sheet's block-end in `.mds-sheet__foot`. It is the signed-in person as `a.mds-nav-user`, the same link the desktop sidebar ends with, to the settings page that holds "Çıkış yap". Below 768 it is the only way to the account, so a shell always passes it.

The bar is 56px, with 8px inline padding and 8px gaps. The menu and close glyphs are the sprite's `menu` and `close`, drawn as masks. The title is Literata 16/600 on one line; a long title ends in an ellipsis. It clips sideways only (`overflow: clip visible`), so an Arabic word in it keeps its descent. The sheet is a native modal `<dialog>` at inline-start: full height, `min(320px, 85vw)` wide, on the surface with a hairline at inline-end and `--elevation-modal`, over `--background-neutral-scrim`. It does not animate in. The sheet id comes from `React.useId`.

## States

- Bar: `--background-neutral-surface` with a `--border-neutral-subtle` hairline at block-end. The title is `--text-neutral-default`.
- Menu button: a large ghost IconButton, 48px square. It takes the `--background-neutral-hover` fill on hover. `aria-expanded` follows the sheet.
- Sheet open: the page behind it is inert. Focus starts on the close button. The items draw exactly as in the sidebar.
- Sheet closed: by Esc, the close button, a click on the backdrop, or a followed link. Focus returns to the menu button. Widening the window past 767px closes it too.
- Focus: the one ring from `tokens/base.css`. Inside the sheet the ring sits on the sheet's own surface, never on the page under the scrim.
- Night: the same roles; bar and sheet are ink, the text is paper (`contrast.md`).
- Forced colours: the glyphs are drawn in `ButtonText`.

## A11y contract

- `<header>` holds the bar. The menu button is `aria-haspopup="dialog"`, with `aria-expanded` and `aria-controls` pointing at the sheet.
- The sheet is a modal `<dialog>` opened with `showModal()`, so the browser provides focus containment, Esc and the inert page. It is named by `navLabel`, and so is its `<nav>`.
- `title` is isolated with `dir="auto"`: a course title may be Arabic.
- `menuLabel`, `navLabel` and `closeLabel` default to "Menü", "Ana menü" and "Kapat".
- The menu button is 48px and the close button 40px, both above the 24px target minimum.

## Rules

MDS-LAY-04, MDS-LAY-05, MDS-A11Y-01, MDS-A11Y-02, MDS-A11Y-04, MDS-A11Y-05, MDS-A11Y-07, MDS-A11Y-08, MDS-COMP-03, MDS-COMP-06, MDS-MOT-01, MDS-SHAPE-02, MDS-TYPE-03, MDS-TYPE-07, MDS-VOICE-02, MDS-COL-09.

- Below 768 the shell hides its sidebar or its top bar at the same width, so the bar never sits beside a sidebar.
- The sheet holds the same sections and items as the sidebar.
- At most two actions, each an IconButton with a label. The page's primary action stays in the page, not in the bar.
- 767.98px is `--bp-tablet` written out, because `var()` cannot be used in a media query.
- The collapsed icon rail is Phase 2.
