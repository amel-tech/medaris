Heights 24 / 32 / 40 / 48. `regular` unless there is a reason. The primary action is written in ink: an ink button by day, a paper button by night.

```jsx
<Button>Ders oluştur</Button>
<Button variant="secondary" size="small" iconLeft={<Icon name="plus" size="sm" />}>Talebe ekle</Button>
<Button variant="ghost">Vazgeç</Button>
<Button variant="outline" href="/dersler/emsile">Dersi gör</Button>
<Button type="submit" loading={saving}>Kaydet</Button>
<Button variant="destructive">Kalıcı olarak sil</Button>
<Button size="large" fullWidth>Derse kaydol</Button>
```

## Anatomy (HTML)

```html
<button type="button" class="mds-btn mds-btn--regular mds-btn--primary">Ders oluştur</button>

<!-- href: a real link; disabled, it drops href and keeps role="link" -->
<a class="mds-btn mds-btn--regular mds-btn--outline" href="/dersler/emsile">Dersi gör</a>
<a class="mds-btn mds-btn--regular mds-btn--outline" role="link" aria-disabled="true">Dersi gör</a>

<!-- loading: the spinner takes iconLeft's place; the status region is a sibling -->
<button type="submit" class="mds-btn mds-btn--regular mds-btn--primary" aria-disabled="true" aria-busy="true"><span class="mds-btn__spinner" aria-hidden="true"></span>Kaydet</button>
<span class="mds-visually-hidden" role="status">Yükleniyor</span>

<!-- fullWidth -->
<button type="button" class="mds-btn mds-btn--large mds-btn--primary mds-btn--full">Derse kaydol</button>
```

`.mds-btn`, one size (`--mini`, `--small`, `--regular`, `--large`), one variant (`--primary`, `--secondary`, `--outline`, `--ghost`, `--destructive`, `--link`), and `--full` for the whole inline size. `iconLeft` and `iconRight` take an `<Icon size="sm">` from the caller. The spinner is the sprite's `spinner` as a CSS mask on `.mds-btn__spinner`, turned by `mds-spin`. The status span renders whenever the caller passes `loading`, empty until the button is busy. An icon-only button is `IconButton`.

## Look

The label is Instrument Sans 14/600, line-height 1. The 1px edge is transparent unless the variant draws it.

| size | height | inline padding | gap | text | radius |
| -- | -- | -- | -- | -- | -- |
| `mini` | 24 | 8 | 4 | 13 | `--radius-tag` (4) |
| `small` | 32 | 12 | 6 | 14 | `--radius-control` (6) |
| `regular` | 40; 32 in a `data-density="compact"` region | 16 | 8 | 14 | `--radius-control` |
| `large` | 48 | 24 | 8 | 16 | `--radius-control` |

| variant | at rest | hover |
| -- | -- | -- |
| `primary` | `--background-action-bold`, `--text-neutral-on-bold` | `--background-action-bold-hover` |
| `secondary` | `--background-neutral-sunken`, default text | `--background-neutral-hover` |
| `outline` | `--background-neutral-surface`, a `--border-neutral-control` edge | `--background-neutral-hover`, a `--border-neutral-strong` edge |
| `ghost` | transparent | `--background-neutral-hover` |
| `destructive` | `--background-error-subtle`, a `--border-error-default` edge, `--text-error-default` | it fills: `--background-error-bold`, `--text-neutral-on-bold` |
| `link` | `--text-brand-default` at 500, a 1px underline, no box, at least 24 high | a 2px underline |

## States

- **Hover:** the fill in the table. No scale, glow or lift.
- **Focus:** the two-band ring from `tokens/base.css` on `:focus-visible`: a 2px paper gap (ink at night), then a 2px lâciverd ring. It is the same on every variant and reads on ink, paper and red fills alike.
- **Disabled:** native `disabled` (or `.is-disabled` on a card). Every variant, destructive included, drops its tone: a `--background-neutral-sunken` well, a `--border-neutral-subtle` edge and `--text-neutral-disabled` text. `ghost` and `link` keep a transparent ground. There is no opacity. It takes no pointer events and leaves the tab order. An action this viewer can never take is absent instead.
- **Busy (`loading`):** `aria-disabled="true"` and `aria-busy="true"`. It keeps its tone and full contrast, shows the progress cursor, and puts the spinner in place of `iconLeft`. It keeps its focus and its name; a click or Enter/Space does nothing; `loadingLabel` ("Yükleniyor") is written into the status region.
- **Disabled link:** `href` removed, `role="link"`, `aria-disabled="true"`: announced as a dimmed link, not focusable. It draws like a disabled button.
- **Night:** the same tokens, re-pointed. The primary button becomes paper with ink text; destructive stays red ink on a red tint.

Every pair above is in `contrast.md`, in both themes: text at least 4.5:1, the outline edge and the focus ring at least 3:1. Disabled text is held to 3:1 by policy, although WCAG exempts it. `check.mjs` measures each state as it renders.

## A11y contract

- `type="button"` unless the caller passes `type="submit"`; with `href` it is a real `<a>`.
- Busy is `aria-disabled`, never `disabled`, which would drop focus mid-submit. The binding cancels click and Enter/Space itself, because `pointer-events` does not stop the keyboard and a busy submit could fire twice.
- `aria-busy` on a button is not announced by the major screen readers, so the status region beside it speaks. Pass `loading={false}` from the first render on any button that can become busy: a live region added at the moment it speaks is not heard.
- The name is the visible label. An icon-only control is `IconButton` with `label`.
- `mini` is 24px high, the smallest target allowed; keep its label wide enough to be 24px across.
- Forced colours: disabled draws its text and edge in `GrayText`; the spinner is `ButtonText`, or `LinkText` on a link; the focus ring becomes a 2px `CanvasText` outline.

## Rules

MDS-COL-01, MDS-COL-08, MDS-COMP-03, MDS-COMP-04, MDS-COMP-05, MDS-MOD-01, MDS-A11Y-01, MDS-A11Y-05, MDS-A11Y-07, MDS-A11Y-08, MDS-A11Y-11, MDS-VOICE-02, MDS-SHAPE-01, MDS-SHAPE-02, MDS-TYPE-02, MDS-MOT-01, MDS-ICON-01.

- One `primary` per surface. It is the one ink button, so the eye finds it first.
- `destructive` is for "Kalıcı olarak sil" alone, after a ghost "Vazgeç". "Gizle", "Yasakla" and "Dersten çıkar" are `primary` with that verb.
- A label starts with its verb: "Celseye katıl", "Derse kaydol", "Talebe ekle".
- `mini` is the in-row size: table actions, a control beside a badge.
- `link` is a text action in a card head or footer ("Tümünü gör"), never the page's main action.
- `fullWidth` is for the phone layout and the sticky enrol card, not for a desktop form.
