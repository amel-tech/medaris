A label, one control, and one line under it: the help, or the error that replaces it.

```jsx
<p className="mds-help">* zorunlu alan</p>

<Field label="Kurs adı" required help="Talebeler bu adı görür.">
  <Input defaultValue="Tefsir Usûlüne Giriş" />
</Field>

<Field label="E-posta" error="Geçerli bir e-posta girin.">
  <Input type="email" defaultValue="ahmed@" />
</Field>

<Field error={onayHatasi}>
  <Checkbox label="Aydınlatma Metni'ni okudum" required />
</Field>
```

## Anatomy (HTML)

```html
<div class="mds-field">
  <label class="mds-label" for="f1">Kurs adı<span class="mds-required" aria-hidden="true">*</span></label>
  <input class="mds-input" id="f1" required aria-required="true" aria-describedby="f1-h">
  <span class="mds-help" id="f1-h">Talebeler bu adı görür.</span>
</div>

<!-- in error: the error takes the help's place -->
<div class="mds-field">
  <label class="mds-label" for="f2">E-posta</label>
  <input class="mds-input" id="f2" aria-invalid="true" aria-describedby="f2-e">
  <span class="mds-error" id="f2-e">Geçerli bir e-posta girin.</span>
</div>
```

`Field` clones its one child with `id` (the child's own, else one from `React.useId`), `aria-describedby` (appended to the child's own), `aria-invalid="true"` only when there is an error, and `required` + `aria-required` only when `required`. It adds nothing else, so a child's own `error` or description survives. The gap between the parts is 6px.

## States

- **Help:** `.mds-help`, `--text-neutral-tertiary`, 7.56:1 on white.
- **Error:** `.mds-error` replaces the help, it does not stack under it; `--text-error-primary`, 4.83:1 on white.
- **Required:** the decorative `.mds-required` asterisk after the label, in the error colour.

## A11y contract

- The label is a real `<label for>`; the help or error is the control's description.
- The requirement is announced from the control's native `required`; the asterisk is `aria-hidden`.
- The error is not a live region: it is read when the control takes focus. On a failed submit, move focus to the first field in error.
- Under `Field`, a Checkbox keeps its own label and `Field` gets none; two labels would read the name twice.

## Rules

MDS-A11Y-03, MDS-A11Y-04, MDS-VOICE-01, MDS-VOICE-02, MDS-VOICE-04, MDS-LAY-01, MDS-COMP-06.

- One control per `Field`: Input, Textarea, Select, or a Checkbox under a help or error line. RadioGroup and ChoiceChips carry their own legend and are never wrapped.
- A form with required fields says once, above it, "* zorunlu alan".
- The help is one sentence. An error says what happened and what to do, in two lines at most, in the app's register.

## From #95

`pr95-migration/pr95-map.json#components.Field`
