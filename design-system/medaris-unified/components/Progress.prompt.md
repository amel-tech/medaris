An 8px track that only ever moves forward, with its name above it. Ezber completion and an upload are the reasons it exists.

```jsx
<Progress label="Bakara sûresi" value={72} showValue />
<Progress label="Kurs ilerlemesi" value={100} showValue />
<Progress label="Ders kaydı yükleniyor" value={uploaded} showValue />
```

## Anatomy (HTML)

```html
<div>
  <div class="mds-progress__label">
    <span id="mds-progress-r1">Bakara sûresi</span>
    <span class="mds-progress__value" aria-hidden="true">%72</span>
  </div>
  <div class="mds-progress" role="progressbar" aria-labelledby="mds-progress-r1"
       aria-valuenow="72" aria-valuemin="0" aria-valuemax="100" aria-valuetext="%72">
    <div class="mds-progress__bar" style="--mds-progress: 72%"></div>
  </div>
</div>
```

The only inline style is the data variable `--mds-progress`, which `.mds-progress__bar` reads as its inline size. The percent is `Intl.NumberFormat(<page locale>, { style: 'percent' })`: "%72" in Turkish, "72‎%‎" in Arabic. At 100 the value reads "%100 tamamlandı" (`completeLabel`) after a check, a mask of the sprite's `check` on `.mds-progress__check`. The label row wraps, the percent staying at inline-end.

## States

- Determinate only, 0–100, clamped.
- Complete: the check and "tamamlandı" beside "%100".
- An unknown wait is a `Skeleton` shaped like what is coming, not a bar.

## A11y contract

- `label` is required and visible; the bar is `role="progressbar"` labelled by it.
- `aria-valuetext` is the percent as printed in the page's locale ("%72"). The printed percent is `aria-hidden`, since the bar already says it.
- The fill is 9.46:1 against white and 7.67:1 against the track.
- Forced colours: the track gets a `CanvasText` border and the fill `Highlight`.

## Rules

MDS-COL-03, MDS-NUM-01, MDS-TOK-02, MDS-A11Y-04, MDS-A11Y-08, MDS-SHAPE-01, MDS-MOT-01.

- The bar is `--background-brand-primary` at every value. Do not turn it red when it is low: the label already says what it is.
- A file upload pairs a native file Input with a Progress.

## From #95

`pr95-migration/pr95-map.json#components.ProgressBar`
