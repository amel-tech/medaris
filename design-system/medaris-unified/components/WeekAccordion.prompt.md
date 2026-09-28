One week of a programme: a heading holding a button that opens the week's lessons. Every week opens for everyone — week titles, lesson titles and dates are public.

```jsx
<div className="mds-weeks">
  <WeekAccordion week={2} title="İkinci ve Üçüncü Bab" state="done" meta="2 ders" />
  <WeekAccordion week={3} title="Dördüncü ve Beşinci Bab" state="active"
    summary={<><span lang="ar" dir="rtl" className="mds-arabic">فَتَحَ</span> bâbı ve harf-i halk illetleri.</>}>
    <LessonRow title="Beşinci babın şerhi" type="live" state="current" href="/oturum/5" />
  </WeekAccordion>
  <WeekAccordion week={4} title="Altıncı Bab ve Tekrar" opensOn="2026-10-17" />
</div>
```

## Anatomy (HTML)

```html
<div class="mds-weeks">
  <div class="mds-week is-active">
    <h3 class="mds-week__heading">
      <button type="button" class="mds-week__trigger" id="w3-b" aria-expanded="true" aria-controls="w3-p">
        <span class="mds-week__medallion" aria-hidden="true">3</span>
        <span class="mds-week__titles">
          <span class="mds-week__eyebrow"><span class="mds-eyebrow">Hafta 3</span><span class="mds-badge mds-badge--brand">Devam ediyor</span></span>
          <span class="mds-week__title" dir="auto">Dördüncü ve Beşinci Bab</span>
        </span>
        <span class="mds-week__meta"><span><time datetime="2026-10-17">17 Ekim</time> tarihinde açılır</span><span><span class="mds-sep" aria-hidden="true">·</span><span>3 ders</span></span></span>
        <span class="mds-week__chevron" aria-hidden="true"></span>
      </button>
    </h3>
    <div class="mds-week__panel" id="w3-p">
      <p class="mds-week__summary" dir="auto">…</p>
      <ol class="mds-lesson-list">…LessonRow li…</ol>
    </div>
  </div>
</div>
```

The component renders one `div.mds-week`; the caller stacks weeks in `div.mds-weeks`. A collapsed panel carries `hidden`. `is-done` and `is-locked` empty the medallion, which shows a check or a lock mask; `is-done` adds the success badge "Tamamlandı". A week with no lessons shows `p.mds-week__empty` in place of the list. With `region`, the panel is `role="region" aria-labelledby` its button. Below 480px of the week's own width (a container query) the meta moves under the title and the lessons under the medallion.

## States

- **collapsed / open** — `aria-expanded` on the button; the chevron points along the reading direction when collapsed, down when open. Several weeks may be open; the active week opens by default.
- **hover** — the page tint on the header; **focus** — `--ring-focus` on the button.
- **active** — the brand medallion and "Devam ediyor"; **done** — a check and "Tamamlandı".
- **locked** (`access`) — a dashed medallion with a lock; the week still opens, and its rows are LessonRow `access="locked"`. It takes precedence over `state`.
- **not open yet** (`opensOn`) — "17 Ekim tarihinde açılır" in the meta; the week still opens.
- **empty** — `emptyLabel` in the panel. There is no disabled week.

## A11y contract

- The WAI-ARIA APG accordion: an `hN` holding one `button` with `aria-expanded` and `aria-controls`; the heading level is `headingLevel` (default 3), so a long programme is navigated by headings. Not `<details>`: its summary flattens the heading.
- `role="region"` only when the course has six weeks or fewer (`region`); more would be landmark noise.
- The medallion, chevron and separators are `aria-hidden`; a locked week adds a visually hidden ", kilitli" after its title. The reason is printed once above the programme.
- No `overflow: hidden` on `.mds-week`, so the ring is never clipped. The title and summary are `dir="auto"`; an Arabic run in them carries `lang="ar" dir="rtl" class="mds-arabic"`, which `dir="auto"` skips when it picks the direction.
- In forced colours the active medallion takes `Highlight`, the glyphs `CanvasText`. The ring's colour is OPEN-1.

## Rules

MDS-DOM-05, MDS-A11Y-02, MDS-A11Y-03, MDS-A11Y-06, MDS-A11Y-08, MDS-COL-03, MDS-COL-05, MDS-STAT-01, MDS-TYPE-04, MDS-TYPE-05, MDS-TYPE-07, MDS-MOT-01, MDS-NUM-01, MDS-VOICE-04, MDS-COMP-04, MDS-COMP-06.

- Never lock a week shut: `access="locked"` locks the lessons' bodies and links, not the programme.
- "Hafta N" is an eyebrow, uppercased by CSS under `lang="tr"`.
- `meta` joins its parts with `.mds-sep`, never a typed "·": "3 ders", "165 dk". Each separator shares a `<span>` with the part after it, so a wrapped line never ends on a dot.
- The children are LessonRow markup only; the week wraps them in the `ol`.

## From #95

`pr95-migration/pr95-map.json#components.WeekAccordion`
