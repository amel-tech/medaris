12px radius, 1px hairline, `--elevation-resting`. Every list item and dashboard tile is built from it.

```jsx
<Card title="Sarf Dersi" action={<Badge variant="primary">Yayında</Badge>}>
  <p className="mds-card__body">12 talebe · haftada 2 ders</p>
</Card>

<Card
  href="/kurslar/avamil"
  title="Avâmil ve Emsile"
  media={<CoverPattern seed={course.id} label="Nahiv" />}
  footer={<>12 hafta<span className="mds-sep" aria-hidden="true">·</span>Cmt 21:00</>}
>
  <p className="mds-card__body" dir="auto">Müderris Abdülhamit Karaosmanoğlu</p>
</Card>
```

## Anatomy (HTML)

```html
<div class="mds-card mds-card--interactive">
  <div class="mds-card__media"><div class="mds-cover mds-cover--sky">…</div></div>
  <div class="mds-card__header">
    <h3 class="mds-card__title" dir="auto"><a class="mds-card__link" href="/kurslar/avamil">Avâmil ve Emsile</a></h3>
    <span class="mds-badge mds-badge--brand">Devam ediyor</span>
  </div>
  <p class="mds-card__body" dir="auto">Müderris Abdülhamit Karaosmanoğlu</p>
  <div class="mds-card__footer">12 hafta<span class="mds-sep" aria-hidden="true">·</span>Cmt 21:00</div>
</div>
```

Every part is optional. `.mds-card__header` appears when there is a title or an action; the heading is `h3` unless `headingLevel` says 2 or 4. `media` bleeds to the card's edges above everything, `footer` below everything behind a `--border-neutral-subtle` hairline. `href` (with a title) makes the title a link and adds `.mds-card--interactive`. `density="compact"` writes `data-density="compact"`, which narrows the inset from 24 to 16. A number tile is `Stat`.

## States

- **Interactive, hover:** the border darkens to `--border-neutral-secondary`. Nothing lifts or scales.
- **Interactive, focus:** the link is focused and the card draws `--ring-focus` around itself (OPEN-1).
- A non-interactive card has no states.

## A11y contract

- A clickable card is one link, in its title: the link's `::after` covers the card, so the card is one tab stop and its name is the title. Never an `onClick` on the `<div>`.
- Links and buttons inside an interactive card sit above that cover and stay separately clickable and focusable.
- The title is author text, so the heading carries `dir="auto"`; an Arabic run inside it carries its own `lang="ar" dir="rtl" class="mds-arabic"`.
- The heading level follows the page's outline (`headingLevel`), not the size you want.
- Forced colours: `base.css` outlines the focused title link.

## Rules

MDS-SHAPE-02, MDS-COL-04, MDS-COL-07, MDS-COMP-03, MDS-TYPE-03, MDS-TYPE-07, MDS-LAY-01, MDS-LAY-02, MDS-A11Y-01, MDS-A11Y-02, OPEN-1.

- The title is Cairo 20 semibold (`.mds-card__title`): the smallest place display type appears, and what keeps a grid of tiles from reading as a form.
- `action` is a badge or a mini ghost button. A primary button in a card header competes with the page's own primary.
- `media` is a `CoverPattern` until a course has cover art, never a flat grey box; no status badge on the cover itself.
- The footer is a meta run: parts joined with `.mds-sep`, times in `<time>`, author strings in `<bdi>`.

## From #95

`pr95-migration/pr95-map.json#components.Card`
