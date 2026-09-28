# tools/design-system

Generators and checks for the Medaris design system in `design-system/` (the
claude.ai/design mirror, its contribution directories, and
`design-system/pr95-migration/`). None of them is wired into CI yet; run them
by hand when those directories change.

There is no `package.json` here. The three dependencies are root
`devDependencies` through the catalog in `pnpm-workspace.yaml`:
`@babel/standalone` (pinned exactly; `regen.mjs` matches the app's bytes with
that version), `react` and `react-dom`. Run `pnpm install` first.

| script | does |
| -- | -- |
| `regen.mjs <source-dir> <target-dir> [--check] [--namespace=…]` | rebuilds `_ds_bundle.js`, `_ds_manifest.json` and `_adherence.oxlintrc.json` from a design-system directory into `<target-dir>`; `--check` compares each with the source's copy |
| `smoke.mjs <design-system-dir \| _ds_bundle.js>` | loads the bundle the way the canvas does and renders every component with a sample that covers its required props |
| `verify-contrast.mjs <design-system-dir>` | recomputes every contrast ratio the system states: the pair table in the script and each row of `foundations/contrast-audit.card.html`, including the card's subtitle counts |
| `check-map.mjs <pr95-map.json> <design-system-dir> [--before=<dir>] [--write-pin]` | validates the #95 port map against the #95 package and the target design system; recomputes the `pin` fingerprint by its recipe |
| `value-bridge.mjs <pr95-map.json> <design-system-dir> <out.css> [--check]` | generates `pr95-value-bridge.css` from the map and the design system's manifest; a map entry with `inherits` is left out |
| `check-port.mjs <file-or-dir>… [--map=…] [--ds=…]` | lists what a screen ported from #95 still carries, with the map's route for each token, silent prop values and components not built yet; warns only |

Every script prints its usage with `--help`. A relative path is taken from the
repository root, so the scripts behave the same from any directory. Exit codes:
0 passed, 1 a check failed, 2 bad arguments. `check-port.mjs` exits 0 whatever it
finds. `check-port.mjs` defaults to `design-system/pr95-migration/pr95-map.json`
and `design-system/medaris-unified`; pass `--map` / `--ds` once either moves.

## Regenerating a design-system directory

`regen.mjs` never writes into its source directory. Generate into a scratch
directory, copy the three files over, then confirm:

```sh
node tools/design-system/regen.mjs design-system/medaris-unified /tmp/regen
cp /tmp/regen/_ds_bundle.js /tmp/regen/_ds_manifest.json \
  /tmp/regen/_adherence.oxlintrc.json design-system/medaris-unified/
node tools/design-system/regen.mjs design-system/medaris-unified /tmp/regen --check
node tools/design-system/smoke.mjs design-system/medaris-unified
```

Never regenerate the mirror (`design-system/` itself): it is pulled from the
project, not built here. `regen.mjs design-system /tmp/out --check` is how to
confirm that the script still matches the app.

## What regen.mjs inferred

The app's generator is not visible. These rules reproduce every file of the
mirror but were never compared against the app on different input, so after a
sync the app's output wins and this script is what changes:

- **Token `kind`.** The rule order in `tokenKind()` reproduces the mirror's
  kinds, quirks included: `--text-*` is `font`, any value holding `var()` is
  `color`, `--fs-*` and `--border-xs` are `spacing`. New tokens can be labelled
  differently from how the app labels them.
- **Duplicate declarations.** The last declaration of a name gives its value;
  its position is the first one's. A contextual re-declaration therefore goes
  before the `:root` block it overrides (MDS-TOK-02).
- **Inputs.** Only `@import url("…")` in `styles.css` is followed, and only
  `components/*.jsx` directly under `components/` is bundled. A capitalised
  export is a component; any other export goes to `unexposedExports`.
- **Bundle scope.** Each `.jsx` is compiled with its imports stripped and wrapped
  in its own function, so a reference to another file's component throws at
  render. `smoke.mjs` catches it.
- **Adherence.** Only the first `export interface` of each `.d.ts` is read, with
  `Props` stripped from its name; only inline unions of string literals get a
  value rule.

## Limits

- `smoke.mjs` renders on the server (`react-dom/server`): effects do not run and
  there is no DOM. A component that gains a required prop needs a sample in
  `SAMPLES`.
- `check-map.mjs` accepts component and class targets that exist in the design
  system or are listed as contracted (Phase 1b) or reserved (Phase 2) at the top
  of the script. It fails when a listed name has been built, so remove the name
  then.
- `verify-contrast.mjs` maps each audit-card row to its token pair by label. A
  new row needs a line in `CARD_ROWS`, or the run fails and names it.
- `check-port.mjs` reads tags with a regular expression, not a parser, so it can
  misplace an element boundary in unusual JSX. It is a checklist, not a gate. It
  picks a `byProperty` target from the property name on the same line as the
  `var()`; a shorthand such as `font` or a value split across lines gets every
  route instead.
- `icons.mjs` (the union, `iconNames` and masks generated from `assets/icons.svg`)
  lands in Phase 1b with the sprite, its only input.
