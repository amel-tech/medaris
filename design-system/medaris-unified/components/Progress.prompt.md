A 6px track that only ever moves forward, with its name above it. Ezber completion and an upload are the reasons it exists.

```jsx
<Progress label="Bakara Sûresi" value={72} showValue />
<Progress label="Kurs ilerlemesi" value={100} showValue />
<Progress label="Ders kaydı yükleniyor" value={uploaded} showValue />
```

## Anatomy (HTML)

```html
<div>
  <div class="mds-progress__label">
    <span id="mds-progress-r1">Bakara Sûresi</span>
    <span class="mds-progress__value" aria-hidden="true">%72</span>
  </div>
  <div class="mds-progress" role="progressbar" aria-labelledby="mds-progress-r1"
       aria-valuenow="72" aria-valuemin="0" aria-valuemax="100" aria-valuetext="%72">
    <div class="mds-progress__bar" style="--mds-progress: 72%"></div>
  </div>
</div>
```

- The track is 6px, round (`--radius-full`), `--background-neutral-sunken` with an inset `--border-neutral-subtle` hairline.
- The bar is `--border-brand-default`, the lâciverd mark colour. The only inline style is the data variable `--mds-progress`, which `.mds-progress__bar` reads as its inline size.
- The label row is 13 in `--text-neutral-subtle`, 6px above the track. It wraps, and the percent stays at inline-end in tabular figures.
- The percent is `Intl.NumberFormat(<page locale>, { style: 'percent' })`: "%72" in Turkish, "72‎%‎" in Arabic.
- At 100 the value reads "%100 tamamlandı" (`completeLabel`) after a 16px check in `--text-success-default`, a mask of the sprite's `check` on `.mds-progress__check`.

## States

- Determinate only, 0–100, clamped. At 0 the track shows empty.
- Complete: the check and "tamamlandı" beside "%100".
- An unknown wait is a `Skeleton` shaped like what is coming, not a bar.

## A11y contract

- `label` is required and visible; the bar is `role="progressbar"` labelled by it.
- `aria-valuetext` is the percent as printed in the page's locale ("%72"). The printed percent is `aria-hidden`, since the bar already says it.
- Both themes: the bar is a 3:1 mark and passes on the track by day and at night (`contrast.md`, "Status marks", `border-brand-default` on `background-neutral-sunken`).
- Forced colours: the track gets a `CanvasText` border, the fill `Highlight` and the check `CanvasText`.

## Rules

MDS-COL-03, MDS-NUM-01, MDS-TOK-02, MDS-A11Y-04, MDS-A11Y-08, MDS-SHAPE-01, MDS-MOT-01, MDS-COMP-06, MDS-TOK-07, MDS-COL-01, MDS-COL-09.

- The bar is lâciverd at every value. Do not turn it red when it is low: the label already says what it is.
- A file upload pairs a native file Input with a Progress.
