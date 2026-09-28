One lesson of a programme: its type as a glyph and a label, its state, its time and length. The whole row is the link to the lesson or session page.

```jsx
<ol className="mds-lesson-list">
  <LessonRow title="Dördüncü babın şerhi" type="live" state="done" href="/oturum/4"
    startsAt="2026-10-03T21:00:00+03:00" durationMinutes={60} />
  <LessonRow title="Beşinci babın şerhi" type="live" state="current" href="/oturum/5"
    source="Bina, s. 20–24" startsAt="2026-10-10T21:00:00+03:00" courseTimeZone="Europe/Istanbul" durationMinutes={60} />
  <LessonRow title="Altıncı babın şerhi" type="live" access="locked" startsAt="2026-10-17T21:00:00+03:00" />
</ol>
```

## Anatomy (HTML)

```html
<ol class="mds-lesson-list">
  <!-- current, the viewer in another zone -->
  <li class="mds-lesson-row mds-lesson-row--live">
    <span class="mds-lesson-row__medallion" aria-hidden="true"></span>
    <div class="mds-lesson-row__main">
      <a class="mds-lesson-row__title" href="/oturum/5" dir="auto" aria-current="step">Beşinci babın şerhi</a>
      <p class="mds-lesson-row__meta"><span class="mds-lesson-row__marker">Sıradaki</span><span><span class="mds-sep" aria-hidden="true">·</span><span>Canlı ders</span></span><span><span class="mds-sep" aria-hidden="true">·</span><bdi class="mds-lesson-row__source">Bina, s. 20–24</bdi></span><span><span class="mds-sep" aria-hidden="true">·</span><time datetime="2026-10-10T21:00:00+03:00">10 Eki Cmt 21:00 İstanbul</time></span><span><span class="mds-sep" aria-hidden="true">·</span><span>20:00 senin saatinle</span></span></p>
    </div>
    <time class="mds-lesson-row__duration" datetime="PT60M">60&nbsp;dk</time>
  </li>
  <!-- done -->
  <li class="mds-lesson-row mds-lesson-row--live is-done">
    <span class="mds-lesson-row__medallion" aria-hidden="true"></span>
    <div class="mds-lesson-row__main">
      <a class="mds-lesson-row__title" href="/oturum/4" dir="auto">Dördüncü babın şerhi<span class="mds-visually-hidden">, tamamlandı</span></a>
      <p class="mds-lesson-row__meta"><span>Canlı ders</span></p>
    </div>
  </li>
  <!-- locked: no link, the lock glyph named -->
  <li class="mds-lesson-row mds-lesson-row--live is-locked">
    <span class="mds-lesson-row__medallion" aria-hidden="true"></span>
    <div class="mds-lesson-row__main">
      <span class="mds-lesson-row__title" dir="auto">Altıncı babın şerhi</span>
      <p class="mds-lesson-row__meta"><span>Canlı ders</span></p>
    </div>
    <span class="mds-lesson-row__lock" role="img" aria-label="Kilitli"></span>
  </li>
</ol>
```

In the meta run each `.mds-sep` shares a `<span>` with the part after it, so a wrapped line starts on the dot instead of ending on it. The component renders the `li`; the caller wraps the rows in `ol.mds-lesson-list` (WeekAccordion does it for its week). `.mds-lesson-row--{type}` picks the medallion glyph, a mask from the sprite: `video` playCircle, `document` doc, `live` video, `quiz` quiz; done shows `check`. `trailing` renders `span.mds-lesson-row__trailing` before the lock and the duration. Times are `Intl` in `locale`: "3 Eki Cmt 21:00", and when `courseTimeZone` differs from the viewer's zone, the course's time with its city, then the viewer's with `localTimeLabel`.

## States

- **default** — the neutral medallion; a linked row takes the page tint on hover.
- **focus** — the link's own ring is removed and the row draws `--ring-focus` around itself.
- **current** — `aria-current="step"` on the link: the brand medallion, the `--background-brand-subtle` tint and the visible "Sıradaki" marker, the only brand-coloured run in the meta (the source is plain text in the meta's ink, not a link).
- **done** — a check on the success pair; the title is unchanged.
- **locked** (`access`) — the title stays in primary ink with no link; the medallion ring is dashed; the lock glyph sits before the duration.
- There is no disabled row. The list's own states are the caller's: loading is 48px `.mds-skeleton` rows, empty is WeekAccordion's `emptyLabel` or an EmptyState, a failed load an error Alert above the list.

## A11y contract

- The title is the row's only link; its `::after` covers the row, and `trailing` sits above it, so a badge or a row action stays its own target and tab stop.
- `aria-current="step"` sits on the link, or on the title `span` when locked — never on the `li`.
- The medallion is `aria-hidden`: the type is the printed label, done is ", tamamlandı" inside the link, locked is the lock's `aria-label`. The reason a row is locked is printed once above the programme (a neutral Alert or the enrol card), never per row.
- Times are `<time datetime>`, the duration `datetime="PT45M"`. The title is `dir="auto"`, the source is in `<bdi>`.
- The tint is 1.07:1 against white and never the only signal. In forced colours the current medallion takes `Highlight` and every glyph `CanvasText`.
- The ring's colour is OPEN-1.

## Rules

MDS-COL-03, MDS-COL-04, MDS-COL-05, MDS-DOM-01, MDS-DOM-05, MDS-NUM-01, MDS-TYPE-02, MDS-TYPE-07, MDS-A11Y-01, MDS-A11Y-03, MDS-A11Y-06, MDS-A11Y-08, MDS-VOICE-04, MDS-STAT-01, MDS-ICON-01, MDS-COMP-04, MDS-COMP-06.

- The type fixes the glyph and the label, drawn neutral; never restyle a row per screen. Only `type="live"` is authored at launch; the other three are rendered. A recording is not a `video` lesson.
- No strikethrough on done; no coloured inline-start bar on current.
- Pass `courseTimeZone` wherever the course has one. Nizam passes `localTimeLabel="sizin saatinizle"`.
- `typeLabel` overrides the status map's label only for a different locale, never to say "Canlı halka".

## From #95

`pr95-migration/pr95-map.json#components.LessonRow`
