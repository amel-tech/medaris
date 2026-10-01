A modal on the native `<dialog>`: a confirmation, a short form, or the full müfredat to read. If the content can live on the page, it belongs on the page.

```jsx
<Dialog
  open={open}
  onClose={(value) => { setOpen(false); if (value === 'confirm') hideCourse(); }}
  kind="alert"
  form
  eyebrow="Nûruosmaniye Köşkü"
  title="Dersi gizle"
  footer={<>
    <Button variant="ghost" value="cancel">Vazgeç</Button>
    <Button type="submit" value="confirm">Gizle</Button>
  </>}
>
  <p><strong><bdi>Bina ve İzhar Şerhi</bdi></strong> talebelerden ve köşk sayfasından gizlenecek. 35 talebe bu dersin celselerine ve ders kayıtlarına erişemeyecek.</p>
  <p>Hiçbir şey silinmez; Arşiv’den geri alabilirsiniz.</p>
</Dialog>

<Dialog
  open={open} onClose={() => setOpen(false)}
  size="lg" eyebrow="Tam müfredat" title="Emsile ve Bina"
  headerActions={<Button variant="ghost" size="small" iconLeft={<Icon name="download" size="sm" />}>PDF olarak indir</Button>}
  footerMeta={<>Son güncelleme: <time dateTime="2026-10-03">3 Ekim 2026</time></>}
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
        <h2 class="mds-dialog__title" id="d1-t" dir="auto">Dersi gizle</h2>
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

- A sheet of paper: the surface fill, `--radius-surface`, `--elevation-modal`, no border. The backdrop is `--background-neutral-scrim` on `::backdrop`.
- Widths: `sm` (440) takes no size class; `.mds-dialog--md` is 640 and `.mds-dialog--lg` 960. None is wider than the viewport less 16px a side.
- Header: padding 24 / 24 / 4. The eyebrow names what the dialog acts on. The title is Literata 20/600.
- The close button is a small (32px) ghost icon button, nudged 6px toward the corner. Its glyph is a CSS mask (`close`).
- Body: 16px in `--text-neutral-muted`, `strong` in default text at 600. Its children are spaced by one 16px gap, so paragraphs and fields need no margins. Padding 12 / 24 / 24.
- Footer: a hairline above it and the page colour as its fill, like the desk under the sheet. Padding 16 / 24; the buttons sit at inline-end, the meta at inline-start.
- `lg` has a hairline under its header, and its body is Literata 18/1.7 in default text, for reading.
- The panel is a `<form method="dialog">` only with `form`; otherwise `<div class="mds-dialog__panel">`. `role="alertdialog"` only with `kind="alert"`.
- A non-form `lg` body is `<div class="mds-dialog__body" role="region" aria-labelledby="d1-t" tabindex="0">`. A non-alert form and the `lg` reading dialog have no `aria-describedby`; an alert dialog is always described by its body, form or not.
- Header and footer are plain `<div>`s: a `<header>` or `<footer>` would be announced as a banner or contentinfo landmark.
- A canvas mock draws the same markup with `<div class="mds-dialog">` in place of `<dialog>`. Product code always opens the modal.

## States

- **Closed / open.** Open is modal: the page is inert and its scroll locked (`html:has(.mds-dialog[open]:modal)`).
- **Focus on open.** The first footer button ("Vazgeç") with `kind="alert"`. Else the first field with `form`. Else the body of a non-form `lg`. Else the browser's first focusable element: the first `headerActions` control if there is one, otherwise the close button.
- **Focus ring.** Controls inside draw the one ring from `tokens/base.css`. The focused `lg` body draws a 2px `--ring-focus-color` outline **inside** itself, on the dialog surface. No ring is drawn around the dialog: there it would sit on the page under the scrim.
- **Busy.** The submitting footer Button takes `loading`.
- **Forced colours.** A `CanvasText` border stands in for the shadow and the tint; the close glyph takes `ButtonText`.

## A11y contract

- Opened with `showModal()`: the top layer, the rest of the page inert, Esc fires `cancel`. Named by its title (`aria-labelledby`); described by its body unless it is a non-alert form or the `lg` reading body.
- Every close calls `onClose` once: with the submitting footer button's `value` in a form, `"cancel"` for "Vazgeç", Esc, the close button and the backdrop. `open={false}` closes without calling it. Focus goes back to the element that had it before opening, also when the dialog unmounts while open.
- Esc always closes. `onCancel` may call `event.preventDefault()` only to confirm leaving unsaved input.
- The backdrop closes only a `dismissible` dialog (by default `kind="dialog"` without `form`), and only when the press also started on the backdrop. So a text selection dragged out of the panel does not close it.
- "Vazgeç" is a `type="button"` with `value="cancel"` in the footer, and the dialog closes itself with `"cancel"` when it is pressed. It never submits. So Enter in a field submits the one action (the footer's only `type="submit"`), a required field never blocks leaving, and cancel never discards typed input by accident.
- `closeLabel` (default "Kapat") names the icon-only close button.
- Both themes: the ring inside a focused body passes on the dialog surface by day and at night (`contrast.md`), and `check.mjs` fails a ring drawn outside a modal.

## Rules

MDS-COMP-05, MDS-COMP-03, MDS-MOD-01, MDS-MOD-02, MDS-A11Y-01, MDS-A11Y-02, MDS-A11Y-04, MDS-A11Y-08, MDS-TYPE-03, MDS-TYPE-06, MDS-TYPE-07, MDS-SHAPE-01, MDS-SHAPE-02, MDS-LAY-01, MDS-VOICE-02, MDS-VOICE-04, MDS-COMP-06, MDS-COL-09.

- Every MDS-COMP-05 confirmation is `kind="alert"`. The footer order is also the focus rule: ghost "Vazgeç" first, then the one action.
- "Kalıcı olarak sil" is the only destructive action, and only the sistem yöneticisi sees it (MDS-MOD-01).
- A ban is a form dialog: a required reason ("Yasaklama gerekçesi"), and the consequence in the body.
- Header actions sit beside the close button, never in the footer. `lg` is for reading, never for a form.
