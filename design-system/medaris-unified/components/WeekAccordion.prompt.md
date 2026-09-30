One week of a programme: a heading holding a button that opens the week's lessons. Every week opens for everyone: week titles, lesson titles and dates are public.

```jsx
<div className="mds-weeks">
  <WeekAccordion week={4} title="Mezîd fiiller ve bablar" state="done" meta="2 celse" />
  <WeekAccordion week={5} title="Mehmûz fiiller" state="active"
    summary={<>Hemzeli fiiller: <span lang="ar" dir="rtl" className="mds-arabic">قرأ</span> ve <span lang="ar" dir="rtl" className="mds-arabic">أخذ</span>; emirde hemzesi düşen üç fiil.</>}>
    <LessonRow title="Mehmûz fiiller: kara’e ve emr-i hâzır" type="live" state="current" href="/celse/5" />
  </WeekAccordion>
  <WeekAccordion week={6} title="Muzâaf fiiller" opensOn="2026-10-10" />
</div>
```

## Anatomy (HTML)

```html
<div class="mds-weeks">
  <div class="mds-week is-active">
    <h3 class="mds-week__heading">
      <button type="button" class="mds-week__trigger" id="w5-b" aria-expanded="true" aria-controls="w5-p">
        <span class="mds-week__medallion" aria-hidden="true">5</span>
        <span class="mds-week__titles">
          <span class="mds-week__eyebrow"><span class="mds-eyebrow">Hafta 5</span><span class="mds-badge mds-badge--brand">Devam ediyor</span></span>
          <span class="mds-week__title" dir="auto">Mehmûz fiiller</span>
        </span>
        <span class="mds-week__meta"><span><span>2 celse</span><span class="mds-sep" aria-hidden="true">·</span></span><span>105 dk</span></span>
        <span class="mds-week__chevron" aria-hidden="true"></span>
      </button>
    </h3>
    <div class="mds-week__panel" id="w5-p">
      <p class="mds-week__summary" dir="auto">…</p>
      <ol class="mds-lesson-list">…LessonRow li…</ol>
    </div>
  </div>
</div>
```

- **Week.** A `--background-neutral-surface` card with a `--border-neutral-subtle` hairline and `--radius-surface` (10px). The active week's edge is `--border-neutral-control`. The caller stacks weeks in `div.mds-weeks`, 8px apart.
- **Trigger.** Padding 12 / 16, in four columns: medallion, titles, meta, chevron.
- **Medallion.** 32px, round, surface-filled with a `--border-neutral-control` edge, and the week's number at 13/600 in tabular figures. `is-done` and `is-locked` empty it, and it shows a check or a lock mask instead.
- **Text.** "Hafta N" is an eyebrow (12px, 600, uppercase in Turkish). The title is Literata 16/600. The meta is 13px `--text-neutral-subtle`, with tabular dates. The chevron is a 16px subtle glyph.
- **Panel.** A hairline above it. The summary and the empty line are 14px `--text-neutral-muted`. The rows are indented so their text lines up with the week's title. A collapsed panel carries `hidden`.
- A week with no lessons shows `p.mds-week__empty` in place of the list. With `region`, the panel is `role="region" aria-labelledby` its button.
- Below 480px of the week's own width (a container query), the meta moves under the title and the lessons under the medallion.

## States

- **collapsed / open**: `aria-expanded` on the button. The chevron points along the reading direction when collapsed and down when open. Several weeks may be open; the active week opens by default.
- **hover**: the `--background-neutral-hover` fill on the trigger.
- **focus**: the one focus ring on the button.
- **active**: the medallion is `--background-brand-bold` with the number in `--text-neutral-on-bold`, the badge is `brand` "Devam ediyor", and the week's edge is the control edge.
- **done**: the medallion is `--background-success-subtle` with a success-coloured check and no edge; the badge is `success` "Tamamlandı".
- **locked** (`access`): a dashed medallion with a subtle lock. The week still opens, and its rows are LessonRow `access="locked"`. It takes precedence over `state`.
- **not open yet** (`opensOn`): "10 Ekim tarihinde açılır" in the meta. The week still opens.
- **empty**: `emptyLabel` in the panel. There is no disabled week.

## A11y contract

- The WAI-ARIA APG accordion: an `hN` holding one `button` with `aria-expanded` and `aria-controls`. The heading level is `headingLevel` (default 3), so a long programme is navigated by headings. Not `<details>`: its summary flattens the heading.
- `role="region"` only when the course has six weeks or fewer (`region`); more would be landmark noise.
- The medallion, chevron and separators are `aria-hidden`. A locked week adds a visually hidden ", kilitli" after its title. The reason is printed once above the programme.
- No `overflow: hidden` on `.mds-week`, so the ring is never clipped. The ring is at least 5.38:1 on every ground by day and 7.07 at night (`contrast.md`).
- The number on the active medallion is 9.23:1 by day and 8.41 at night (`contrast.md`, "Text on bold fills").
- The title and summary are `dir="auto"`. An Arabic run in them carries `lang="ar" dir="rtl" class="mds-arabic"`, which `dir="auto"` skips when it picks the direction. It is written without harakat, because this is UI text.
- In forced colours the medallion edge is `CanvasText`, the active medallion `Highlight` with `HighlightText`, and the glyphs `CanvasText`.

## Rules

MDS-DOM-05, MDS-A11Y-01, MDS-A11Y-02, MDS-A11Y-03, MDS-A11Y-08, MDS-COL-03, MDS-COL-05, MDS-STAT-01, MDS-TYPE-04, MDS-TYPE-05, MDS-TYPE-07, MDS-MOT-01, MDS-NUM-01, MDS-VOICE-04, MDS-COMP-04, MDS-COMP-06.

- Never lock a week shut: `access="locked"` locks the lessons' bodies and links, not the programme.
- "Hafta N" is an eyebrow, uppercased by CSS under `lang="tr"`.
- `meta` joins its parts with `.mds-sep`, never a typed "·": "2 celse", "105 dk". Each part but the last shares a `<span>` with the separator after it, so a wrapped line ends on the dot and never starts with it.
- The children are LessonRow markup only; the week wraps them in the `ol`.
