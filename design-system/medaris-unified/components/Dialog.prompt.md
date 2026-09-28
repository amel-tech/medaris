A modal on the native `<dialog>`: a confirmation, a short form, or the full müfredat to read. If the content can live on the page, it belongs on the page.

```jsx
<Dialog
  open={open}
  onClose={(value) => { setOpen(false); if (value === 'confirm') hideCourse(); }}
  kind="alert"
  form
  eyebrow="Nûruosmaniye Köşkü"
  title="Kursu gizle"
  footer={<>
    <Button variant="ghost" value="cancel">Vazgeç</Button>
    <Button type="submit" value="confirm">Gizle</Button>
  </>}
>
  <p><bdi>Bina ve İzhar Şerhi</bdi> talebelerden ve köşk sayfasından gizlenecek. Hiçbir şey silinmez; Arşiv’den geri alabilirsiniz.</p>
</Dialog>

<Dialog
  open={open} onClose={() => setOpen(false)}
  size="lg" eyebrow="Tam müfredat" title="Bina ve İzhar Şerhi"
  headerActions={<Button variant="ghost" size="small" iconLeft={<Icon name="download" size="sm" />}>PDF olarak indir</Button>}
  footerMeta="Son güncelleme: 3 Ekim 2026"
>
  {weeks.map((w) => <WeekAccordion key={w.week} {...w} />)}
</Dialog>
```

## Anatomy (HTML)

```html
<dialog class="mds-dialog" role="alertdialog" aria-labelledby="d1-t" aria-describedby="d1-b">
  <form method="dialog" class="mds-dialog__panel">
    <div class="mds-dialog__header">
      <div class="mds-dialog__heading">
        <p class="mds-eyebrow" dir="auto">Nûruosmaniye Köşkü</p>
        <h2 class="mds-dialog__title" id="d1-t" dir="auto">Kursu gizle</h2>
      </div>
      <div class="mds-dialog__actions">
        <!-- headerActions -->
        <button type="button" class="mds-btn mds-icon-btn mds-btn--small mds-btn--ghost mds-dialog__close" aria-label="Kapat"></button>
      </div>
    </div>
    <div class="mds-dialog__body" id="d1-b"><p>…</p></div>
    <div class="mds-dialog__footer">
      <p class="mds-dialog__meta">…</p> <!-- footerMeta -->
      <button type="button" class="mds-btn mds-btn--regular mds-btn--ghost" value="cancel">Vazgeç</button>
      <button type="submit" class="mds-btn mds-btn--regular mds-btn--primary" value="confirm">Gizle</button>
    </div>
  </form>
</dialog>
```

- The panel is a `<form method="dialog">` only with `form`; otherwise `<div class="mds-dialog__panel">`. `role="alertdialog"` only with `kind="alert"`.
- `sm` (400) takes no size class; `.mds-dialog--md` is 640, `.mds-dialog--lg` 960, and none is wider than the viewport less 16px a side.
- A non-form `lg` body is `<div class="mds-dialog__body" role="region" aria-labelledby="d1-t" tabindex="0">`. A non-alert form and the `lg` reading dialog have no `aria-describedby`; an alert dialog is always described by its body, form or not.
- Header and footer are plain `<div>`s: a `<header>` or `<footer>` would be announced as a banner or contentinfo landmark.
- The close glyph is a CSS mask (`close`); the backdrop is `--background-neutral-scrim` on `::backdrop`; the dialog floats on `--elevation-modal`.
- A canvas mock draws the same markup with `<div class="mds-dialog">` in place of `<dialog>`, inside the artboard. Product code always opens the modal.

## States

- **Closed / open.** Open is modal: the page is inert and its scroll locked (`html:has(.mds-dialog[open]:modal)`).
- **Focus on open.** The first footer button ("Vazgeç") with `kind="alert"`; else the first field with `form`; else the body of a non-form `lg`, whose ring the dialog draws; else the browser's first focusable element: the first `headerActions` control if there is one, otherwise the close button.
- **Busy.** The submitting footer Button takes `loading`.
- **Forced colours.** A `CanvasText` border stands in for the shadow and the tint; the close glyph takes `ButtonText`.

## A11y contract

- Opened with `showModal()`: the top layer, the rest of the page inert, Esc fires `cancel`. Named by its title (`aria-labelledby`); described by its body unless it is a non-alert form or the `lg` reading body.
- Every close calls `onClose` once: with the submitting footer button's `value` in a form, `"cancel"` for "Vazgeç", Esc, the close button and the backdrop. `open={false}` closes without calling it. Focus goes back to the element that had it before opening, also when the dialog unmounts while open.
- Esc always closes. `onCancel` may call `event.preventDefault()` only to confirm leaving unsaved input.
- The backdrop closes only a `dismissible` dialog (by default `kind="dialog"` without `form`), and only when the press also started on the backdrop, so a text selection dragged out of the panel does not close it.
- "Vazgeç" is a `type="button"` with `value="cancel"` in the footer, and the dialog closes itself with `"cancel"` when it is pressed. It never submits, so Enter in a field submits the one action (the footer's only `type="submit"`), a required field never blocks leaving, and cancel never discards typed input by accident.
- `closeLabel` (default "Kapat") names the icon-only close button.

## Rules

MDS-COMP-05, MDS-COMP-03, MDS-MOD-01, MDS-MOD-02, MDS-A11Y-01, MDS-A11Y-02, MDS-A11Y-04, MDS-A11Y-08, MDS-TYPE-03, MDS-TYPE-06, MDS-TYPE-07, MDS-SHAPE-01, MDS-SHAPE-02, MDS-SHAPE-04, MDS-LAY-01, MDS-VOICE-02, MDS-VOICE-04, MDS-COMP-06.

- Every MDS-COMP-05 confirmation is `kind="alert"`. The footer order is also the focus rule: ghost "Vazgeç" first, then the one action.
- A ban is a form dialog: a required reason, and the consequence in the body.
- Header actions sit beside the close button, never in the footer. `lg` is for reading, never for a form.
- The body spaces its children with one 16px gap, so paragraphs and fields need no margins.
- The focus ring is OPEN-1: `--ring-focus` is 1.26:1 on white, and an invalid field's `--ring-focus-error` 1.45:1.

## From #95

`pr95-migration/pr95-map.json#components.Dialog`
