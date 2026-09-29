One lesson of a programme: its type as a glyph and a label, its state, its time and length. The whole row is the link to the lesson or session page. The rows read like a ledger: hairlines between them, the titles in Literata.

```jsx
<ol className="mds-lesson-list">
  <LessonRow title="Mezîd fiiller ve bablar" type="live" state="done" href="/oturum/4"
    startsAt="2026-09-26T21:00:00+03:00" durationMinutes={60} />
  <LessonRow title="Mehmûz fiiller: kara’e ve emr-i hâzır" type="live" state="current" href="/oturum/5"
    source="Bina, s. 20–24" startsAt="2026-10-03T21:00:00+03:00" courseTimeZone="Europe/Istanbul"
    durationMinutes={60} trailing={<Badge variant="live">Şu an canlı</Badge>} />
  <LessonRow title="Muzâaf fiiller" type="live" access="locked" startsAt="2026-10-10T21:00:00+03:00" />
</ol>
```

## Anatomy (HTML)

```html
<ol class="mds-lesson-list">
  <!-- current, live now, the viewer in another zone -->
  <li class="mds-lesson-row mds-lesson-row--live">
    <span class="mds-lesson-row__medallion" aria-hidden="true"></span>
    <div class="mds-lesson-row__main">
      <a class="mds-lesson-row__title" href="/oturum/5" dir="auto" aria-current="step">Mehmûz fiiller: kara’e ve emr-i hâzır</a>
      <p class="mds-lesson-row__meta"><span><span class="mds-lesson-row__marker">Sıradaki</span><span class="mds-sep" aria-hidden="true">·</span></span><span><span>Canlı ders</span><span class="mds-sep" aria-hidden="true">·</span></span><span><bdi class="mds-lesson-row__source">Bina, s. 20–24</bdi><span class="mds-sep" aria-hidden="true">·</span></span><span><time datetime="2026-10-03T21:00:00+03:00">3 Eki Cmt 21:00 İstanbul</time><span class="mds-sep" aria-hidden="true">·</span></span><span>20:00 senin saatinle</span></p>
    </div>
    <span class="mds-lesson-row__trailing"><span class="mds-badge mds-badge--live"><span class="mds-badge__dot" aria-hidden="true"></span>Şu an canlı</span></span>
    <time class="mds-lesson-row__duration" datetime="PT60M">60&nbsp;dk</time>
  </li>
  <!-- done -->
  <li class="mds-lesson-row mds-lesson-row--live is-done">
    <span class="mds-lesson-row__medallion" aria-hidden="true"></span>
    <div class="mds-lesson-row__main">
      <a class="mds-lesson-row__title" href="/oturum/4" dir="auto">Mezîd fiiller ve bablar<span class="mds-visually-hidden">, tamamlandı</span></a>
      <p class="mds-lesson-row__meta"><span>Canlı ders</span></p>
    </div>
  </li>
  <!-- locked: no link, the lock glyph named -->
  <li class="mds-lesson-row mds-lesson-row--live is-locked">
    <span class="mds-lesson-row__medallion" aria-hidden="true"></span>
    <div class="mds-lesson-row__main">
      <span class="mds-lesson-row__title" dir="auto">Muzâaf fiiller</span>
      <p class="mds-lesson-row__meta"><span>Canlı ders</span></p>
    </div>
    <span class="mds-lesson-row__lock" role="img" aria-label="Kilitli"></span>
  </li>
</ol>
```

- **Row.** At least 56px tall, padding 12 / 16, gap 16, `--radius-control` (6px). A `--border-neutral-subtle` hairline sits between two ordinary rows. It disappears next to the current row and around a hovered row.
- **Medallion.** 36px, round, a `--background-neutral-surface` fill with a `--border-neutral-control` edge, and a 16px glyph in `--text-neutral-muted`. `.mds-lesson-row--{type}` picks the glyph, a mask from the sprite: `video` playCircle, `document` doc, `live` video, `quiz` quiz. Done shows `check`.
- **Text.** The title is Literata 16/600 in `--text-neutral-default`. The meta is 13px `--text-neutral-subtle`, with tabular figures in its times. The duration is 13px, subtle and tabular, at the row's end. The lock is a 16px subtle glyph before the duration.
- In the meta run each part but the last shares a `<span>` with the `.mds-sep` after it, so a wrapped line ends on the dot and never starts with it.
- The component renders the `li`; the caller wraps the rows in `ol.mds-lesson-list` (WeekAccordion does it for its week). `trailing` renders `span.mds-lesson-row__trailing` before the lock and the duration.
- Times are `Intl` in `locale`: "3 Eki Cmt 21:00". When `courseTimeZone` differs from the viewer's zone, the course's time prints with its city, then the viewer's with `localTimeLabel`.

## States

- **default**: the neutral medallion.
- **hover** (a linked row): the `--background-neutral-hover` fill.
- **focus**: the link's own ring is removed and the row draws the one focus ring around itself.
- **current** (`aria-current="step"` on the link): the row takes `--background-brand-subtle`; the medallion is `--background-brand-bold` with a `--text-neutral-on-bold` glyph; the "Sıradaki" marker is brand text at 600. The marker is the only brand-coloured word in the meta.
- **done**: the medallion is `--background-success-subtle` with a success-coloured check and no edge. The title is unchanged.
- **locked** (`access`): the medallion edge is dashed and its glyph subtle; the title stays in ink at 500, with no link; the lock glyph sits before the duration.
- There is no disabled row. The list's own states are the caller's: loading is 56px `.mds-skeleton` rows, empty is WeekAccordion's `emptyLabel` or an EmptyState, a failed load an error Alert above the list.

## A11y contract

- The title is the row's only link. Its `::after` covers the row, and `trailing` sits above it, so a badge or a row action stays its own target and tab stop.
- `aria-current="step"` sits on the link, or on the title `span` when locked, never on the `li`.
- The medallion is `aria-hidden`: the type is the printed label, done is ", tamamlandı" inside the link, locked is the lock's `aria-label`. The reason a row is locked is printed once above the programme (a neutral Alert or the enrol card), never per row.
- Times are `<time datetime>`, the duration `datetime="PT45M"`. The title is `dir="auto"`, the source is in `<bdi>`.
- The current tint is 1.12:1 against the surface by day and 1.05 at night, so it is never the only signal: the medallion and the "Sıradaki" marker (8.18:1 by day, 7.38 at night) carry the state. On the tint the meta is at least 4.84:1 (`contrast.md`).
- The ring is at least 5.38:1 on every ground by day and 7.07 at night, in both themes (`contrast.md`).
- In forced colours the medallion edge and every glyph are `CanvasText`, and the current medallion is `Highlight`.

## Rules

MDS-COL-03, MDS-COL-04, MDS-COL-05, MDS-DOM-01, MDS-DOM-05, MDS-NUM-01, MDS-TYPE-02, MDS-TYPE-07, MDS-A11Y-01, MDS-A11Y-03, MDS-A11Y-08, MDS-VOICE-04, MDS-STAT-01, MDS-ICON-01, MDS-COMP-04, MDS-COMP-06.

- The type fixes the glyph and the label, drawn neutral; never restyle a row per screen. Only `type="live"` is authored at launch; the other three are rendered. A recording is not a `video` lesson.
- No strikethrough on done; no coloured inline-start bar on current.
- A lesson that is live now takes a `live` Badge in `trailing`; the row itself never turns red.
- Pass `courseTimeZone` wherever the course has one. Nizam passes `localTimeLabel="sizin saatinizle"`.
- `typeLabel` overrides the status map's label only for a different locale, never to say "Canlı halka".
