A row of tabs over a hairline. The selected tab is ink at 600 over a 2px lâciverd underline. A count sits in a round pill after the label.

```jsx
<Tabs
  label="Ders bölümleri"
  idBase="ders"
  value={tab}
  onChange={setTab}
  tabs={[
    { value: 'genel', label: 'Genel' },
    { value: 'talebeler', label: 'Talebeler', count: 28 },
    { value: 'celseler', label: 'Celseler', count: 12 },
    { value: 'kayitlar', label: 'Ders kayıtları', count: 4 },
  ]}
/>
<div role="tabpanel" id={`ders-panel-${tab}`} aria-labelledby={`ders-tab-${tab}`} tabIndex={0}>…</div>
```

## Anatomy (HTML)

```html
<!-- mode="tabs": one object cut into views -->
<div class="mds-tabs" role="tablist" aria-label="Ders bölümleri">
  <button type="button" class="mds-tab" role="tab" id="ders-tab-genel" aria-controls="ders-panel-genel" aria-selected="true" tabindex="0">Genel</button>
  <button type="button" class="mds-tab" role="tab" id="ders-tab-talebeler" aria-controls="ders-panel-talebeler" aria-selected="false" tabindex="-1">Talebeler<span class="mds-tab__count">28</span></button>
</div>
<div role="tabpanel" id="ders-panel-genel" aria-labelledby="ders-tab-genel" tabindex="0">…</div>

<!-- mode="links": each tab is its own page -->
<nav class="mds-tabs" aria-label="Ders bölümleri">
  <a class="mds-tab" href="/dersler/emsile" aria-current="page">Genel</a>
  <a class="mds-tab" href="/dersler/emsile/talebeler">Talebeler<span class="mds-tab__count">28</span></a>
</nav>
```

The ids are `${idBase}-tab-${value}` and `${idBase}-panel-${value}`, so a tab's `value` must be id-safe. Tabs renders the tab row; the caller renders the panels with those ids, at least the selected one. `.is-active` is kept as an alias of the selected state for static markup. Counts are formatted with `Intl` in the page's locale ("1.250"). In links mode each tab needs an `href`, and `onChange` is not called.

Each tab is `--size-control-regular` tall: 40px, or 32px inside `data-density="compact"`. It has 8/12 padding and 14px medium text. The row has a `--border-neutral-subtle` hairline at block-end. The underline is `--border-width-thick`. Only the selected tab and the Tedris top-bar link use that width.

## States

- Rest: `--text-neutral-muted`.
- Hover: `--text-neutral-default` on the `--background-neutral-hover` fill.
- Selected: `--text-neutral-default` at 600, over a 2px `--border-brand-default` underline. Only the underline is lâciverd; the words stay in ink.
- Count: 13px `--text-neutral-muted` on `--background-neutral-sunken`. On the selected tab: `--text-brand-default` on `--background-brand-subtle`.
- Focus: the one ring from `tokens/base.css`.
- Night: the same roles (`contrast.md` holds every pair in both themes).
- Forced colours: only the selected tab keeps its line, in `Highlight`.
- Below 768 a row wider than the screen scrolls inside itself, and the page does not scroll sideways. The hairline is then drawn as an inset line at the row's block-end, and a focused tab draws the same two-band ring inside itself, because the scrolling row would clip its lower edge.

## A11y contract

- APG tabs with automatic activation. There is one tab stop, the selected tab. ←/→ move and select, reversed under `dir="rtl"`, and wrap at the ends. Home and End jump to the first and last tab.
- `label` names the tablist, or the `<nav>` in links mode (MDS-A11Y-04).
- Each tab `aria-controls` its panel. The panel is `aria-labelledby` its tab, and focusable (`tabindex="0"`) when it has nothing focusable inside.
- Links mode has no tab roles. The links are ordinary tab stops, and the current one is `aria-current="page"`.
- The selected state is never colour alone: the weight changes and the underline appears.

## Rules

MDS-A11Y-01, MDS-A11Y-02, MDS-A11Y-03, MDS-A11Y-04, MDS-A11Y-08, MDS-COL-01, MDS-COL-03, MDS-TYPE-02, MDS-NUM-01, MDS-LAY-02, MDS-LAY-04, MDS-LAY-05, MDS-VOICE-02, MDS-COL-09, MDS-TOK-07.

- Tabs cut one object into views. If the panels are different pages, use `mode="links"`; if they are different objects, they belong in the sidebar.
- Four tabs is the practical ceiling at 390. Beyond that the row scrolls, and a scrolling row hides its own options.
- A breadcrumb and tabs on one screen is normal: the breadcrumb says which ders, and the tabs say which part of it.
- Nizam's lists filter by state with tabs and counts ("Yayında 4", "Taslak 2"). Choice chips filter by subject; they never stand in for tabs.
