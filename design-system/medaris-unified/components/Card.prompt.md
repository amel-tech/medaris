A sheet of paper on the page: the surface fill, a `--border-neutral-subtle` hairline, `--radius-surface` (10) and no shadow. Every list item and dashboard tile is built from it.

```jsx
<Card title="İsâgûcî Şerhi" action={<Badge variant="outline">Taslak</Badge>} density="compact">
  <p className="mds-card__body">Mantık · 14 hafta · celse yok</p>
</Card>

<Card
  href="/dersler/emsile-ve-bina"
  title="Emsile ve Bina"
  action={<Badge variant="brand">Devam ediyor</Badge>}
  media={<CoverPattern seed={course.id} size="sm" label="الصرف" />}
  footer={<><bdi>Nûruosmaniye Köşkü</bdi><span className="mds-sep" aria-hidden="true">·</span><time dateTime="2026-10-03T21:00+03:00">Cmt 21:00</time></>}
>
  <p className="mds-card__body" dir="auto">Müderris Abdülhamit Karaosmanoğlu</p>
</Card>
```

## Anatomy (HTML)

```html
<div class="mds-card mds-card--interactive">
  <div class="mds-card__media">
    <div class="mds-cover mds-cover--bordo mds-cover--sm"><p class="mds-eyebrow mds-cover__label" lang="ar" dir="rtl">الصرف</p></div>
  </div>
  <div class="mds-card__header">
    <h3 class="mds-card__title" dir="auto"><a class="mds-card__link" href="/dersler/emsile-ve-bina">Emsile ve Bina</a></h3>
    <span class="mds-badge mds-badge--brand">Devam ediyor</span>
  </div>
  <p class="mds-card__body" dir="auto">Müderris Abdülhamit Karaosmanoğlu</p>
  <div class="mds-card__footer"><bdi>Nûruosmaniye Köşkü</bdi><span class="mds-sep" aria-hidden="true">·</span><time datetime="2026-10-03T21:00+03:00">Cmt 21:00</time></div>
</div>
```

Every part is optional.

- `.mds-card__header` appears when there is a title or an action. The heading is `h3` unless `headingLevel` says 2 or 4.
- The title is Literata 20/600 (`--fs-h3`) in default text. The body is 14 in `--text-neutral-muted`.
- `media` bleeds to the card's edges above everything. Its top corners follow the card's radius.
- `footer` sits below everything, behind a hairline. It is 13 in `--text-neutral-subtle`.
- `href` (with a title) makes the title a link and adds `.mds-card--interactive`.
- `density="compact"` writes `data-density="compact"`, which narrows the inset from 24 to 16.
- A number tile is `Stat`.

## States

- **Interactive, hover:** the edge darkens to `--border-neutral-control`. Nothing lifts or scales.
- **Interactive, focus:** the title link has focus, and the card draws the ring around itself. It is the one ring from `tokens/base.css`: `outline: var(--ring-focus-outline)` plus `box-shadow: var(--ring-focus)`.
- A card without `href` has no states.

## A11y contract

- A clickable card is one link, in its title. The link's `::after` covers the card, so the card is one tab stop and its name is the title. Never put an `onClick` on the `<div>`.
- Links and buttons inside an interactive card sit above that cover. They stay separately clickable and focusable.
- The title is author text, so the heading carries `dir="auto"`. An Arabic run inside it carries its own `lang="ar" dir="rtl" class="mds-arabic"`.
- The heading level follows the page's outline (`headingLevel`), not the size you want.
- Both themes: every text on the surface passes AA by day and at night (`contrast.md`), and `check.mjs` measures each rendered text node.
- Forced colours: the hairline stays, and the focused card draws its outline in system colours.

## Rules

MDS-SHAPE-01, MDS-SHAPE-02, MDS-COL-04, MDS-COL-07, MDS-COMP-03, MDS-TYPE-03, MDS-TYPE-07, MDS-NUM-01, MDS-LAY-01, MDS-LAY-02, MDS-A11Y-01, MDS-A11Y-02, MDS-A11Y-08, MDS-COL-08, MDS-COL-09.

- `action` is a badge or a mini ghost button. A primary button in a card header competes with the page's own primary.
- `media` is a `CoverPattern` band (`sm` in a grid) until a course has cover art. Never a flat grey box, and no status badge on the cover.
- The footer is a meta run: parts joined with `.mds-sep`, times in `<time>`, author strings in `<bdi>`.
