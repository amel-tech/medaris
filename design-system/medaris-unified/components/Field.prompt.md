A label, one control, and one line under it: the help, or the error that replaces it.

```jsx
<p className="mds-caption">* zorunlu alan</p>

<Field label="Ders adı" required help="Talebeler bu adı görür.">
  <Input defaultValue="Emsile ve Bina" />
</Field>

<Field label="E-posta" error="Geçerli bir e-posta adresi yazın.">
  <Input type="email" defaultValue="zeynep.betul@" />
</Field>

<Field error={onayHatasi}>
  <Checkbox label="Aydınlatma Metni’ni okudum" required />
</Field>
```

## Anatomy (HTML)

```html
<div class="mds-field">
  <label class="mds-label" for="f1">Ders adı<span class="mds-required" aria-hidden="true">*</span></label>
  <input class="mds-input" id="f1" required aria-required="true" aria-describedby="f1-h">
  <span class="mds-help" id="f1-h">Talebeler bu adı görür.</span>
</div>

<!-- in error: the error takes the help's place -->
<div class="mds-field">
  <label class="mds-label" for="f2">E-posta</label>
  <input class="mds-input" id="f2" aria-invalid="true" aria-describedby="f2-e">
  <span class="mds-error" id="f2-e">Geçerli bir e-posta adresi yazın.</span>
</div>
```

`Field` clones its one child with `id` (the child's own, else one from `React.useId`), `aria-describedby` (appended to the child's own), `aria-invalid="true"` only when there is an error, and `required` + `aria-required` only when `required`. It adds nothing else, so a child's own `error` or description survives. The parts are 6px apart.

## States

- **Label:** `.mds-label`, 14/500, `--text-neutral-default`.
- **Help:** `.mds-help`, 13px, `--text-neutral-subtle`: 6.81:1 on the surface by day, 5.09:1 by night.
- **Error:** `.mds-error` replaces the help; it does not stack under it. 13/500, `--text-error-default`: 7.88:1 on the surface by day, 7.84:1 by night. The control's own edge doubles in red at the same time, so the error never rests on colour alone.
- **Required:** `.mds-required`, the decorative asterisk after the label, in `--text-neutral-subtle`. It is not red: red means something went wrong.

## A11y contract

- The label is a real `<label for>`; the help or error is the control's description.
- The requirement is announced from the control's native `required`; the asterisk is `aria-hidden`.
- The error is not a live region: it is read when the control takes focus. On a failed submit, move focus to the first field in error.
- Under `Field`, a Checkbox keeps its own label and `Field` gets none; two labels would read the name twice.
- Both themes pass by construction; the pairs are in `contrast.md`.

## Rules

MDS-A11Y-03, MDS-A11Y-04, MDS-A11Y-06, MDS-COL-03, MDS-COL-08, MDS-VOICE-01, MDS-VOICE-02, MDS-VOICE-04, MDS-LAY-01, MDS-COMP-06.

- One control per `Field`: Input, Textarea, Select, or a Checkbox under a help or error line. RadioGroup and ChoiceChips carry their own legend and are never wrapped.
- A form with required fields says once, above it, "* zorunlu alan".
- The help is one sentence. An error says what happened and what to do, in two lines at most, in the app's register: *siz* in Nizam ("Geçerli bir e-posta adresi yazın."), *sen* in Tedris and Giriş ("Devam etmek için metni okuduğunu onayla.").
