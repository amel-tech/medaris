A 40px box (32 in a compact region) with a 6px radius and a 1px ink edge at 3:1 or more. Textarea and Select use the same box.

```jsx
<Field label="E-posta" help="Davet bu adrese gider.">
  <Input type="email" placeholder="talebe@example.com" />
</Field>

<Field label="Toplantı bağlantısı" required help="Platform, bağlantının adresinden anlaşılır.">
  <Input type="url" mono placeholder="https://meet.google.com/…" />
</Field>

<Field label="Süre (dk)">
  <Input type="number" trailing="dk" defaultValue={60} />
</Field>

<Field label="Giriş e-postası" help="Giriş yaptığınız adres.">
  <Input type="email" readOnly value="abdulhamit@medaris.org" />
</Field>

<Input type="search" aria-label="Ders veya müderris ara" placeholder="Ders veya müderris ara" leading={<Icon name="search" size="sm" />} />
```

## Anatomy (HTML)

```html
<input class="mds-input" id="f1" aria-describedby="f1-h">
<!-- sizes: .mds-input--mini 24 · --small 32 · regular 40, no class (32 inside data-density="compact") · --large 48 -->
<input class="mds-input mds-input--mono" type="url" dir="ltr">
<input class="mds-input" aria-invalid="true" aria-describedby="f1-e">
<input class="mds-input" readonly aria-describedby="f2-h" value="abdulhamit@medaris.org">
<span class="mds-help" id="f2-h">Salt okunur. Giriş yaptığınız adres.</span>
<input class="mds-input" type="file" accept="video/*">

<span class="mds-input-group">
  <span class="mds-input-group__leading" aria-hidden="true"><svg class="mds-icon mds-icon--sm">…</svg></span>
  <input class="mds-input" type="search" aria-label="Ders veya müderris ara">
</span>
<span class="mds-input-group">
  <input class="mds-input" type="number" id="f2">
  <span class="mds-input-group__trailing" aria-hidden="true">dk</span>
</span>
```

Native attributes, `aria-*` included, and `className` go to the `<input>`. `mono` adds `dir="ltr"`. With `leading` or `trailing` the input sits in `.mds-input-group`, and the adornment takes no pointer, so a click on it lands in the field. Use a 16px glyph as `leading` (`size="sm"`): the text then starts 36px in. Adornments are `--text-neutral-subtle`, 12px in from the edge.

## States

- **Rest:** `--background-neutral-field`, a 1px `--border-neutral-control` edge, 14px text in `--text-neutral-default`.
- **Placeholder:** `--text-neutral-subtle` at full opacity. It hints at the format; it is never the label.
- **Hover:** the edge turns `--border-neutral-strong`. A disabled, read-only or invalid field keeps its own edge.
- **Focus:** `:focus` (alias `.is-focus`): the strong edge and the focus ring (`--ring-focus`: a 2px gap, then a 2px lapis band).
- **Invalid:** `[aria-invalid="true"]` (alias `.is-error`): the edge is `--border-error-default`, doubled by a 1px inset line, so it reads without colour vision. Focused, the ring is added outside the inset. There is one ring; there is no red ring.
- **Read-only:** `[readonly]`: `--background-neutral-sunken`. The value stays `--text-neutral-default` and can be focused, selected and copied. The fill is one ramp step from the field by night, so a read-only field always carries a help text that begins "Salt okunur." — the words say it, not the fill.
- **Disabled:** `[disabled]` (alias `.is-disabled`): a sunken well; the control edge stays and turns dashed, so it still reads as a field (MDS-A11Y-11). The value is in `--text-neutral-disabled`. It does not fade: there is no opacity. Not focusable, not submitted.
- **File:** the browser's button, drawn as a mini secondary button (24px, `--radius-tag`, 13/600); hover `--background-neutral-hover`.
- **Sizes:** `--mini` 24 (13px text, `--radius-tag`) · `--small` 32 · regular 40, or 32 inside `data-density="compact"` · `--large` 48 (16px text, 16px padding).
- **Phone:** below 768px the text is 16px (the mini size excepted), so a phone does not zoom into the field.
- **Forced colours:** disabled is `GrayText`; invalid becomes a 2px `CanvasText` edge; focus is the outline from `tokens/base.css`.

## A11y contract

- Named by a visible label through `Field`. A search field with no visible label takes `aria-label`; a placeholder is not a name.
- `error` sets `aria-invalid="true"`; `Field` sets it for you and wires the message with `aria-describedby`.
- Both adornments are `aria-hidden`: a unit is also written in the label ("Süre (dk)"), and a leading glyph is decoration.
- `mono` fields are `dir="ltr"`, so a link stays left-to-right on an Arabic page. A field that may receive Arabic (a summary, a card face) takes `dir="auto"`, and `.mds-input:dir(rtl)` switches it to the Arabic face as the text arrives.
- A value the viewer may see but not change is `readOnly`, never `disabled`: disabled drops it from the tab order and from the form.
- The file input's button text and "no file" text are the browser's, in the browser's language, not the page's.
- One focus ring, in both themes. The edge is 3.89:1 on the field by day and 4.61:1 by night, and 3.12:1 at its lowest (on the hover ground). The ring is 6.69:1 and 8.41:1 on the field; the error edge 6.01:1 and 5.97:1; the placeholder 6.81:1 and 5.51:1. Every pair is in `contrast.md`. `check.mjs` tabs through every field in the light theme, both dark paths and a night island.

## Rules

MDS-A11Y-01, MDS-A11Y-02, MDS-A11Y-03, MDS-A11Y-04, MDS-A11Y-06, MDS-A11Y-08, MDS-A11Y-11, MDS-COL-08, MDS-COL-09, MDS-TYPE-01, MDS-TYPE-02, MDS-TYPE-07, MDS-SHAPE-01, MDS-LAY-02, MDS-LAY-04, MDS-LAY-05, MDS-DOM-03, MDS-COMP-01.

- Always inside `Field`, which is what guarantees the label, the description and the error are announced.
- `mono` is for identifiers only: meeting links, IDs, handles. A meeting link is `mono type="url"`; its platform is resolved from the host by the app, never picked.
- A tag list at launch is one comma-separated Input ("Etiketler", help "Virgülle ayırın.").
- A file is `<Input type="file">` followed by a `Progress` for the upload.
