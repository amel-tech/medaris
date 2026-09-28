36px tall, 6px radius — the one control that is not on the 8px radius, which is what separates it from a button beside it.

```jsx
<Field label="E-posta" help="Davet bu adrese gider.">
  <Input type="email" placeholder="talebe@example.com" />
</Field>

<Field label="Toplantı bağlantısı" required>
  <Input type="url" mono placeholder="https://meet.google.com/…" />
</Field>

<Field label="Süre (dk)">
  <Input type="number" trailing="dk" defaultValue={60} />
</Field>

<Field label="E-posta" help="Giriş yaptığınız adres.">
  <Input type="email" readOnly value="abdulhamit@medaris.org" />
</Field>

<Input type="search" aria-label="Kurs ara" placeholder="Kurs ara" leading={<Icon name="search" size="sm" />} />
```

## Anatomy (HTML)

```html
<input class="mds-input" id="f1" aria-describedby="f1-h">
<!-- sizes: .mds-input--mini 24 · --small 32 · regular 36, no class · --large 42 -->
<input class="mds-input mds-input--mono" type="url" dir="ltr">
<input class="mds-input" aria-invalid="true" aria-describedby="f1-e">
<input class="mds-input" readonly value="abdulhamit@medaris.org">
<input class="mds-input" type="file" accept="video/*">

<span class="mds-input-group">
  <span class="mds-input-group__leading" aria-hidden="true"><svg class="mds-icon mds-icon--sm">…</svg></span>
  <input class="mds-input" type="search" aria-label="Kurs ara">
</span>
<span class="mds-input-group">
  <input class="mds-input" type="number" id="f2">
  <span class="mds-input-group__trailing" aria-hidden="true">dk</span>
</span>
```

Native attributes, `aria-*` included, and `className` go to the `<input>`. `mono` adds `dir="ltr"`. With `leading` or `trailing` the input sits in `.mds-input-group`, and the adornment takes no pointer, so a click on it lands in the field. Use a 16px glyph as `leading` (`size="sm"`): the text starts 36px in.

## States

- **Placeholder:** `--text-neutral-disabled`. A hint of the format, never the label.
- **Focus:** `:focus` (alias `.is-focus`): `--ring-focus` and a `--border-neutral-tertiary` border.
- **Error:** `[aria-invalid="true"]` (alias `.is-error`): `--border-error-primary`; focused, the ring is `--ring-focus-error`.
- **Read-only:** `[readonly]`: `--background-neutral-secondary`, the value stays `--text-neutral-primary`, and it can be focused, selected and copied.
- **Disabled:** `[disabled]` (alias `.is-disabled`): the same ground, the value in `--text-neutral-disabled`; `GrayText` in forced colours. Not focusable, not submitted.
- **File:** the browser's button, drawn as a mini secondary button; hover `--background-neutral-tertiary`.
- No hover state: the Figma file defines none for a field.

## A11y contract

- Named by a visible label through `Field`. A search field with no visible label takes `aria-label`; a placeholder is not a name.
- `error` sets `aria-invalid="true"`; `Field` sets it for you and wires the message with `aria-describedby`.
- Both adornments are `aria-hidden`: a unit is also written in the label ("Süre (dk)"), and a leading glyph is decoration.
- `mono` fields are `dir="ltr"`, so a link stays left-to-right on an Arabic page. A field that may receive Arabic (a summary, a card face) takes `dir="auto"`, and `.mds-input:dir(rtl)` switches it to the Arabic face as the text arrives.
- A value the viewer may see but not change is `readOnly`, never `disabled`: disabled drops it from the tab order and from the form.
- The file input's button text and "no file" text are the browser's, in the browser's language, not the page's.
- The boundary is `--border-neutral-secondary`, 1.47:1 on white (OPEN-3). The error ring is 1.45:1 on white (OPEN-1). Both are named, not fixed: do not add a darker border or a shadow to compensate.

## Rules

MDS-A11Y-02, MDS-A11Y-03, MDS-A11Y-04, MDS-A11Y-06, MDS-TYPE-01, MDS-TYPE-02, MDS-TYPE-07, MDS-SHAPE-01, MDS-LAY-05, MDS-DOM-03, MDS-COMP-01.

- Always inside `Field`, which is what guarantees the label, the description and the error are announced.
- `mono` is for identifiers only: meeting links, IDs, handles. A meeting link is `mono type="url"`; its platform is resolved from the host by the app, never picked.
- A tag list at launch is one comma-separated Input ("etiketler").
- A file is `<Input type="file">` followed by a `Progress` for the upload.

## From #95

`pr95-migration/pr95-map.json#components.Input`
