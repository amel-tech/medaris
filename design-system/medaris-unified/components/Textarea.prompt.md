The input box grown to rows: at least 96px tall, 1.5 leading, resized only in the block direction.

```jsx
<Field label="Müderrisin notu">
  <Textarea rows={4} dir="auto" placeholder="Talebelere celseye gelmeden önce ne okumaları gerektiğini yazın." />
</Field>

<Field label="Yasaklama gerekçesi" required error="Bir gerekçe yazın.">
  <Textarea rows={3} />
</Field>
```

## Anatomy (HTML)

```html
<textarea class="mds-input mds-textarea" id="f4" rows="4" dir="auto" aria-describedby="f4-h"></textarea>
```

Native attributes, `aria-*` included, and `className` go to the `<textarea>`. The box is `.mds-input`: the same fill, edge, radius and text. `.mds-textarea` frees its height, pads it 8px in the block direction and 12px inline, and sets `--lh-body`.

## States

Those of `Input`: placeholder (`--text-neutral-subtle`), hover (the strong edge), focus (`:focus`, the ring), invalid (`[aria-invalid="true"]`, the doubled red edge, and the ring outside it when focused), read-only (`[readonly]`, sunken, the text in ink) and disabled (`[disabled]`, sunken, a dashed edge, `--text-neutral-disabled`, no opacity). The resize handle is the browser's. Below 768px the text is 16px.

## A11y contract

- Named by `Field`'s label; `error` sets `aria-invalid="true"`, and `Field` wires the message.
- Text an author writes, which may be Arabic, takes `dir="auto"`; the field then switches to the Arabic face under `:dir(rtl)`.
- One focus ring, in both themes. The edge, the ring and the error edge are the input box's pairs in `contrast.md`: the edge 3.89:1 on the field by day and 4.61:1 by night, the ring 6.69:1 and 8.41:1.

## Rules

MDS-A11Y-01, MDS-A11Y-02, MDS-A11Y-03, MDS-A11Y-06, MDS-A11Y-11, MDS-COL-08, MDS-TYPE-06, MDS-TYPE-07, MDS-VOICE-04, MDS-MOD-02, MDS-COMP-01.

- Always inside `Field`.
- A field for running text is no wider than `--layout-measure-prose`.
- A ban, and the removal of one, carries a reason: a required Textarea in the dialog.
