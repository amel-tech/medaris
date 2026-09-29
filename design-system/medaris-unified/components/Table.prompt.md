A named table in a paper frame: hairline rows, 14px cells, small grey headers and figures that line up. Nizam's lists put it in a compact region; a list used on a phone stacks.

```jsx
<div data-density="compact">
  <Table
    caption="Nûruosmaniye Köşkü kursları"
    sort={sort}
    onSortChange={setSort}
    columns={[
      { key: 'title', header: 'Kurs', rowHeader: true, sortable: true, render: (r) => <bdi>{r.title}</bdi> },
      { key: 'muderris', header: 'Müderris', render: (r) => <bdi>{r.muderris}</bdi> },
      { key: 'talebe', header: 'Talebe', align: 'right', sortable: true },
      { key: 'next', header: 'Sıradaki oturum', render: (r) => <time dateTime={r.nextIso}>{r.next}</time> },
      { key: 'state', header: 'Durum', render: (r) => <Badge variant={r.badge}>{r.label}</Badge> },
      { key: 'actions', header: <span className="mds-visually-hidden">İşlemler</span>, align: 'right',
        render: (r) => <><Button variant="ghost" size="mini">Düzenle</Button><Button variant="ghost" size="mini">Gizle</Button></> },
    ]}
    rows={kurslar}
    rowKey={(r) => r.id}
    empty="Bu köşkte henüz kurs yok."
  />
</div>
```

## Anatomy (HTML)

```html
<div class="mds-table-wrap" tabindex="0" role="region" aria-labelledby="t1">  <!-- the three attributes only while it scrolls -->
  <table class="mds-table">
    <caption class="mds-table__caption mds-visually-hidden" id="t1">Nûruosmaniye Köşkü kursları</caption>
    <colgroup><col><col><col style="--mds-col-w: 20%"></colgroup>  <!-- only when a column has a width -->
    <thead><tr>
      <th scope="col" aria-sort="ascending"><button type="button" class="mds-table__sort">Kurs<span class="mds-table__sort-icon" aria-hidden="true"></span></button></th>
      <th scope="col">Sıradaki oturum</th>
      <th scope="col" class="is-end"><button type="button" class="mds-table__sort">Talebe<span class="mds-table__sort-icon" aria-hidden="true"></span></button></th>
    </tr></thead>
    <tbody>
      <tr><th scope="row"><bdi>Emsile ve Bina</bdi></th><td><time datetime="2026-10-03T21:00+03:00">3 Eki Cmt 21:00</time></td><td class="is-end">28</td></tr>
    </tbody>
  </table>
</div>

<!-- rows is empty -->
<tbody><tr><td class="mds-table__empty" colspan="3">Bu köşkte henüz kurs yok.</td></tr></tbody>

<!-- responsive="stack": explicit roles, the caption names the table, data-label from string headers -->
<table class="mds-table mds-table--stack" role="table" aria-labelledby="t2">
  … <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">…</th>…
  … <tr role="row"><th scope="row" role="rowheader">…</th><td role="cell" data-label="Kurs">…</td><td role="cell" class="mds-table__primary-action">…</td></tr>
</table>
```

`align: 'right'` renders `.is-end` (`text-align: end`), so a number column follows the reading direction. `emphasis` renders `.mds-table__cell--muted` (subtle text) or `--strong` (600). A column's `width` is a CSS length or a percentage, carried by the data variable `--mds-col-w`. Numbers, dates and row actions do not wrap.

The look: the frame is `--background-neutral-surface` with a `--border-neutral-subtle` hairline and `--radius-surface`. Cells are 14px with `font-variant-numeric: lining-nums tabular-nums`, padded by `--space-cell-block` / `--space-cell-inline`: 12/16, and 8/12 inside `data-density="compact"`. Headers are 13px medium in `--text-neutral-subtle`, with 8px block padding. A visible caption is Literata 16/600.

**The course cell.** Nizam's course lists name each row with an `xs` CoverPattern (24 × 32, a plain cloth swatch, `aria-hidden`), the title in Literata 14/600 (`--font-reading`, `--fs-body-sm`) and a `.mds-caption` meta line ("Sarf · 12 hafta"). The page lays these out; the cover's tone is the course's own.

## States

- Row hover: the row takes `--background-neutral-hover`. No lift, no shadow. A "Yayında" badge (`primary`, the same fill) takes `--background-neutral-surface` on a hovered row, so it keeps its shape.
- Sortable header: a button with the `chevronsUpDown` glyph at 14px. The sorted column carries `aria-sort`, its header turns `--text-neutral-default`, and the glyph becomes `chevronUp` or `chevronDown`. A click reports the next sort (ascending first, then the reverse); the caller sorts the rows.
- Empty: `empty`, one sentence centred in `--text-neutral-subtle`.
- Loading: the caller sets `aria-busy="true"` on the region and draws Skeleton rows. Error: an error Alert above the table says what failed and what to do. The table keeps its caption in both.
- Scrolling frame: focusable, with the one ring from `tokens/base.css`.
- Night: the same roles; the frame is ink and the text is paper (`contrast.md`).
- Forced colours: the sort glyph is `ButtonText`.
- Below 768, `responsive="stack"`: the header row is hidden but still read, and each row is a card. When a column is sortable, the header row stays visible as a sort bar that shows only the sortable headers' buttons, so no focusable control is left in a clipped box. Each row is a card: the row header as its semibold title, each cell under its column's name, and the primary action at full width with the other actions under it. `responsive="scroll"` scrolls inside the frame.

## A11y contract

- `caption` is required, and it names the table. It is visually hidden unless `captionVisible`, and it names the scrolling region too.
- The column that names a row (the talebe, the kurs) is `rowHeader`, so it renders as `<th scope="row">`.
- A sortable header is a real button inside the `<th>`, and `aria-sort` is on the `<th>` of the sorted column only.
- An actions column still has a header, visually hidden ("İşlemler"). Empty header cells are an error.
- `stack` adds `role="table"`, `rowgroup`, `row`, `columnheader`, `rowheader` and `cell`, because `display: block` can drop the table semantics. The `data-label` text is drawn with empty alternative text, so it is not read twice.

## Rules

MDS-A11Y-01, MDS-A11Y-02, MDS-A11Y-04, MDS-A11Y-05, MDS-A11Y-08, MDS-LAY-02, MDS-LAY-04, MDS-LAY-05, MDS-TYPE-02, MDS-TYPE-07, MDS-NUM-01, MDS-COMP-04, MDS-MOD-01, MDS-STAT-01, MDS-VOICE-01, MDS-VOICE-04, MDS-COL-04, MDS-COL-07, MDS-SHAPE-02, MDS-COL-09.

- No filled header band, no bold headers, no zebra stripes.
- Row actions are always drawn at inline-end, never revealed on hover. In a scroll table they are `mini` `ghost`. In a stack table they go full width below 768, so pass the primary one as `small` `outline` in a column marked `primaryAction`, and the others as `small` `ghost`. Until Menu exists (Phase 2), secondary actions wrap under the primary one.
- The owned-record action is "Gizle", never "Sil" (MDS-MOD-01). The badges come from the status map.
- A course keeps its own state (Yayında, Taslak, Gizli) in one column. Its enrolment states are counted badges in another ("3 onay bekliyor", "1 yasaklı").
- `empty` is one sentence about what is missing, in the surface's register: *siz* in Nizam, *sen* in Tedris. The default "Bu listede henüz bir şey yok." is only a fallback.
- Wrap author-written cells (titles, names) in `<bdi>`, and dates in `<time>`.
- Dense lists sit in a `data-density="compact"` region; there is no per-table density prop.
