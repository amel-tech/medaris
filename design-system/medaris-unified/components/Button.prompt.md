Heights 24 / 32 / 36 / 42, taken off the Figma symbols. `regular` unless there is a reason.

```jsx
<Button>Ders oluştur</Button>
<Button variant="secondary" size="small" iconLeft={<Icon name="plus" size="sm" />}>Talebe ekle</Button>
<Button variant="ghost">Vazgeç</Button>
<Button variant="outline" href="/kurslar/avamil">Kursu gör</Button>
<Button type="submit" loading={saving}>Kaydet</Button>
<Button size="large" fullWidth>Kursa kaydol</Button>
```

## Anatomy (HTML)

```html
<button type="button" class="mds-btn mds-btn--regular mds-btn--primary">Ders oluştur</button>

<!-- href: a real link; disabled, it drops href and keeps role="link" -->
<a class="mds-btn mds-btn--regular mds-btn--outline" href="/kurslar/avamil">Kursu gör</a>
<a class="mds-btn mds-btn--regular mds-btn--outline" role="link" aria-disabled="true">Kursu gör</a>

<!-- loading: the spinner takes iconLeft's place; the status region is a sibling -->
<button type="submit" class="mds-btn mds-btn--regular mds-btn--primary" aria-disabled="true" aria-busy="true"><span class="mds-btn__spinner" aria-hidden="true"></span>Kaydet</button>
<span class="mds-visually-hidden" role="status">Yükleniyor</span>

<!-- fullWidth -->
<button type="button" class="mds-btn mds-btn--large mds-btn--primary mds-btn--full">Kursa kaydol</button>
```

`.mds-btn`, one size (`--mini`, `--small`, `--regular`, `--large`), one variant (`--primary`, `--secondary`, `--outline`, `--ghost`, `--destructive`, `--link`), and `--full` for the whole inline size. `iconLeft` and `iconRight` take an `<Icon size="sm">` from the caller. The spinner is the sprite's `spinner` as a CSS mask on `.mds-btn__spinner`, turned by `mds-spin`. The status span renders whenever the caller passes `loading`, empty until the button is busy. An icon-only button is `IconButton`.

## States

- **Hover:** one ramp step darker; outline and ghost take the secondary fill. No scale, glow or lift.
- **Focus:** `--ring-focus` on `:focus-visible`. Its colour is OPEN-1, for every variant.
- **Disabled:** native `disabled` (or `.is-disabled` on a card): 50% opacity, no pointer events, out of the tab order. An action this viewer can never take is absent instead.
- **Busy (`loading`):** `aria-disabled="true"` and `aria-busy="true"`, 50% opacity, the progress cursor, the spinner in place of `iconLeft`. It keeps its focus and its name; a click or Enter/Space does nothing; `loadingLabel` ("Yükleniyor") is written into the status region.
- **Disabled link:** `href` removed, `role="link"`, `aria-disabled="true"`: announced as a dimmed link, not focusable.

## A11y contract

- `type="button"` unless the caller passes `type="submit"`; with `href` it is a real `<a>`.
- Busy is `aria-disabled`, never `disabled`, which would drop focus mid-submit. The binding cancels click and Enter/Space itself, because `pointer-events` does not stop the keyboard and a busy submit could fire twice.
- `aria-busy` on a button is not announced by the major screen readers, so the status region beside it speaks. Pass `loading={false}` from the first render on any button that can become busy: a live region added at the moment it speaks is not heard.
- The name is the visible label. An icon-only control is `IconButton` with `label`.
- `mini` is 24px high, the smallest target allowed; keep its label wide enough to be 24px across.
- Forced colours: disabled draws in `GrayText`; the spinner in `ButtonText`, or `LinkText` on a link.

## Rules

MDS-COMP-03, MDS-COMP-05, MDS-MOD-01, MDS-A11Y-01, MDS-A11Y-05, MDS-A11Y-07, MDS-A11Y-08, MDS-A11Y-11, MDS-VOICE-02, MDS-SHAPE-02, MDS-MOT-01, MDS-ICON-01, OPEN-1, OPEN-2.

- `destructive` is for "Kalıcı olarak sil" alone; "Gizle", "Yasakla" and "Kurstan çıkar" are `primary` with that verb. White on `--background-error-base` is 3.76:1 as extracted (OPEN-2).
- A label starts with its verb: "Derse katıl", "Kursa kaydol", "Talebe ekle".
- `mini` is the in-row size: table actions, controls beside a badge. It drops to 12px text and `--radius-xxs`, so it stops reading as a button below about 60px wide.
- `fullWidth` is for the phone layout and the sticky enrol card, not for a desktop form.

## From #95

`pr95-migration/pr95-map.json#components.Button`
