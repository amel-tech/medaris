The compact chrome below 768: a 56px bar with the menu button, the mark, the page's name and at most two actions. The menu opens the nav sheet. At 768 and up the bar is not drawn.

```jsx
<AppBar
  title="Oturumlar"
  logo={<Logo app="nizam" size="sm" />}
  actions={<IconButton icon={<Icon name="bell" />} label="Bildirimler" />}
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
  <NavSection>Genel</NavSection>
  <NavItem href="/" active>Ana sayfa</NavItem>
  <NavItem href="/oturumlar" count={2} countLabel="bağlantısı eksik">Oturumlar</NavItem>
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
  <p class="mds-appbar__title" dir="auto">Oturumlar</p>
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
    <nav class="mds-nav--light" aria-label="Ana menü">…NavSection and NavItem markup…</nav>
    <div class="mds-sheet__foot mds-nav--light">
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

AppBar draws the bar, the sheet and the light `<nav>`. `footer` sits at the sheet's block-end in `.mds-sheet__foot`: the signed-in person as `a.mds-nav-user`, the same link the desktop sidebar ends with, to the settings page that holds "Çıkış yap" (B11, B13). Below 768 it is the only way to the account, so a shell always passes it. The caller passes the Logo and the NavItems; AppBar never references them itself. The menu and close glyphs are the sprite's `menu` and `close`, drawn as masks. The sheet is a native modal `<dialog>` at inline-start: full height, `min(320px, 85vw)` wide, over `--background-neutral-scrim`, with `--elevation-modal`. It does not animate in. The sheet id comes from `React.useId`.

## States

- Bar: white, with a hairline at block-end. The title is `--text-neutral-primary`, 16 semibold, one line with an ellipsis, 17.74:1.
- Menu button: `aria-expanded` follows the sheet; ghost hover. It is 42px square, above the 24px target minimum.
- Sheet open: the page behind it is inert. Focus starts on the close button, and the items draw as in `.mds-nav--light` (7.56, 16.19 and 8.24:1).
- Sheet closed: by Esc, the close button, a click on the backdrop, or a followed link. Focus returns to the menu button. Widening the window past 767px closes it too.
- Focus: `--ring-focus` (OPEN-1). Forced colours: the glyphs are drawn in `ButtonText`.

## A11y contract

- `<header>` holds the bar; the menu button is `aria-haspopup="dialog"`, `aria-expanded` and `aria-controls` the sheet.
- The sheet is a modal `<dialog>` opened with `showModal()`, so the browser provides focus containment, Esc and the inert page. It is named by `navLabel`, and so is its `<nav>`.
- `title` is isolated with `dir="auto"`: a course title may be Arabic.
- `menuLabel`, `navLabel` and `closeLabel` default to "Menü", "Ana menü" and "Kapat".

## Rules

MDS-LAY-04, MDS-LAY-05, MDS-A11Y-01, MDS-A11Y-02, MDS-A11Y-04, MDS-A11Y-05, MDS-A11Y-07, MDS-A11Y-08, MDS-COMP-06, MDS-MOT-01, MDS-SHAPE-02, MDS-TYPE-07, MDS-VOICE-02.

- Below 768 the shell hides its sidebar and its top bar at the same width, so the bar never sits beside a sidebar.
- The sheet holds the same items as the sidebar, light, whatever the sidebar's surface (SPEC-D3-04).
- At most two actions, each an IconButton with a label. The page's primary action stays in the page, not in the bar.
- Breakpoints are SPEC-D3-07: 767.98px is `--bp-tablet` written out.
- The collapsed icon rail is Phase 2.

## From #95

None: #95 has no compact chrome. Its icon rail is dropped, see `pr95-migration/pr95-map.json#tokens.--rail-w-icon`.
