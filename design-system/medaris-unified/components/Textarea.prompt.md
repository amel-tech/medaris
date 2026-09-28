The input box grown to rows: 80px at least, 1.5 leading, resized only in the block direction.

```jsx
<Field label="Ders açıklaması" help="Birkaç cümleyle dersin amacı ve kimler için olduğu.">
  <Textarea rows={4} dir="auto" />
</Field>

<Field label="Yasaklama gerekçesi" required error="Bir gerekçe yazın.">
  <Textarea rows={3} />
</Field>
```

## Anatomy (HTML)

```html
<textarea class="mds-input mds-textarea" id="f4" rows="4" dir="auto" aria-describedby="f4-h"></textarea>
```

Native attributes, `aria-*` included, and `className` go to the `<textarea>`.

## States

Those of `Input`: placeholder, focus (`:focus`), error (`[aria-invalid="true"]`), read-only (`[readonly]`), disabled (`[disabled]`). No hover, as for every field.

## A11y contract

- Named by `Field`'s label; `error` sets `aria-invalid="true"`, and `Field` wires the message.
- Text an author writes, which may be Arabic, takes `dir="auto"`; the field then switches to the Arabic face under `:dir(rtl)`.
- The boundary is 1.47:1 (OPEN-3) and the error ring 1.45:1 (OPEN-1), inherited from the input box.

## Rules

MDS-A11Y-02, MDS-A11Y-06, MDS-TYPE-06, MDS-TYPE-07, MDS-VOICE-04, MDS-MOD-02, MDS-COMP-01.

- Always inside `Field`.
- A field for running text is no wider than `--layout-measure-prose`.
- A ban, and the removal of one, carries a reason: a required Textarea in the dialog.

## From #95

`pr95-migration/pr95-map.json#components.Textarea`
