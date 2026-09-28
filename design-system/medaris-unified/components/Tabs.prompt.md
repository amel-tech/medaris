A row of tabs with a 2px brand underline on the selected one, the only use of `--border-m`. A count sits in a pill after the label.

```jsx
<Tabs
  label="Kurs bölümleri"
  idBase="kurs"
  value={tab}
  onChange={setTab}
  tabs={[
    { value: 'genel', label: 'Genel' },
    { value: 'talebeler', label: 'Talebeler', count: 28 },
    { value: 'oturumlar', label: 'Oturumlar', count: 12 },
    { value: 'kayitlar', label: 'Ders kayıtları', count: 4 },
  ]}
/>
<div role="tabpanel" id={`kurs-panel-${tab}`} aria-labelledby={`kurs-tab-${tab}`} tabIndex={0}>…</div>
```

## Anatomy (HTML)

```html
<!-- mode="tabs": one object cut into views -->
<div class="mds-tabs" role="tablist" aria-label="Kurs bölümleri">
  <button type="button" class="mds-tab" role="tab" id="kurs-tab-genel" aria-controls="kurs-panel-genel" aria-selected="true" tabindex="0">Genel</button>
  <button type="button" class="mds-tab" role="tab" id="kurs-tab-talebeler" aria-controls="kurs-panel-talebeler" aria-selected="false" tabindex="-1">Talebeler<span class="mds-tab__count">28</span></button>
</div>
<div role="tabpanel" id="kurs-panel-genel" aria-labelledby="kurs-tab-genel" tabindex="0">…</div>

<!-- mode="links": each tab is its own page -->
<nav class="mds-tabs" aria-label="Kurs bölümleri">
  <a class="mds-tab" href="/kurslar/emsile" aria-current="page">Genel</a>
  <a class="mds-tab" href="/kurslar/emsile/talebeler">Talebeler<span class="mds-tab__count">28</span></a>
</nav>
```

The ids are `${idBase}-tab-${value}` and `${idBase}-panel-${value}`, so a tab's `value` must be id-safe. Tabs renders the tab row; the caller renders the panels with those ids, at least the selected one. `.is-active` is kept as an alias of the selected state for static markup. Counts are formatted with `Intl` in the page's locale ("1.250"). In links mode each tab needs an `href`, and `onChange` is not called.

## States

- Rest: `--text-neutral-tertiary`, 7.56:1 on white. Hover: `--text-neutral-primary`.
- Selected: `--text-brand-primary`, 9.46:1, over a 2px `--border-brand-primary` line.
- Count: `--text-neutral-tertiary` on `--background-neutral-secondary`, 6.90:1; on the selected tab `--text-brand-primary` on `--background-brand-tertiary`, 8.24:1.
- Focus: `--ring-focus` (OPEN-1).
- Forced colours: only the selected tab keeps its line, in `Highlight`.
- Below 768 a row wider than the screen scrolls inside itself, and the page does not scroll sideways.

## A11y contract

- APG tabs with automatic activation. There is one tab stop, the selected tab. ←/→ move and select, reversed under `dir="rtl"`, and wrap at the ends. Home and End jump to the first and last tab.
- `label` names the tablist, or the `<nav>` in links mode (MDS-A11Y-04).
- Each tab `aria-controls` its panel, and the panel is `aria-labelledby` its tab and focusable (`tabindex="0"`) when it has nothing focusable inside.
- Links mode has no tab roles: the links are ordinary tab stops, and the current one is `aria-current="page"`.

## Rules

MDS-A11Y-02, MDS-A11Y-03, MDS-A11Y-04, MDS-A11Y-08, MDS-COL-01, MDS-TYPE-02, MDS-NUM-01, MDS-LAY-04, MDS-LAY-05, MDS-VOICE-02.

- Tabs cut one object into views. If the panels are different pages, use `mode="links"`; if they are different objects, they belong in the sidebar.
- Four tabs is the practical ceiling at 390. Beyond that the row scrolls, and a scrolling row hides its own options.
- A breadcrumb and tabs on one screen is normal: the breadcrumb says which kurs, and the tabs say which part of it.
- Choice chips filter a list; they never stand in for tabs.

## From #95

`pr95-migration/pr95-map.json#components.Tabs`
