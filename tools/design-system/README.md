# tools/design-system

Generators and checks for the Medaris design system in `design-system/`: the
claude.ai/design mirror and its contribution directories. The new system,
designed from scratch in MDRS-131, is `design-system/medaris-unified/`. None of
these scripts is wired into CI yet. Run them by hand when a design-system
directory changes.

There is no `package.json` here. `regen.mjs` needs `@babel/standalone` (pinned
exactly; it matches the app's bytes with that version) and `smoke.mjs` needs
`react` and `react-dom`. They are root `devDependencies` through the catalog in
`pnpm-workspace.yaml`. Run `pnpm install` first.

`check.mjs` needs no package. It needs Chromium at `/usr/bin/chromium` (or
`--chromium=<path>`) and the network, because the faces come from Google Fonts.

| script | does |
| -- | -- |
| `regen.mjs <source-dir> <target-dir> [--check] [--namespace=…]` | rebuilds `_ds_bundle.js`, `_ds_manifest.json` and `_adherence.oxlintrc.json` from a design-system directory into `<target-dir>`. `--check` compares each with the source's copy. |
| `icons.mjs --dir <design-system-dir> [--masks <file>] [--check]` | writes every copy of `assets/icons.svg`: the `name` union in `Icon.d.ts`, the generated block in `Icon.jsx` (path tables, mirrored set, `iconNames`) and the "Glyph masks (generated)" section of each class layer, one `mask-image` per request in `icon-masks.json`. `--check` writes nothing. It fails when a copy differs from the sprite, or a requested glyph is not in it. |
| `smoke.mjs <design-system-dir \| _ds_bundle.js>` | loads the bundle the way the canvas does and renders every component once, with a sample that covers its required props, then a few further cases whose markup must hold a given string (an unknown platform keeps its label, a countdown starts with a capital). |
| `verify-contrast.mjs [design-system-dir] [--write]` | recomputes every colour pair the system promises, in the day and the night theme, from `tokens/*.css`. It also checks the colour vocabulary, and that `contrast.md` is what this run writes. It writes the two marked blocks of `foundations/contrast-audit.card.html` the same way, and fails any ratio a card prints as `N,NN:1` that `contrast.md` does not list. `--write` rewrites `contrast.md` and those blocks. |
| `check.mjs [design-system-dir] [--static] [--only=<text>] [--chromium=<path>]` | the browser gate. It renders every page in four theme paths and checks tokens, contrast (at rest and with every hoverable element hovered), faded controls, focus rings, targets, Arabic and Qur'an text, and Turkish glyphs. `--static` runs only the file checks. `--only` renders only the pages whose path holds the text; the Turkish glyph gate still runs. |

`lib.mjs` holds what the scripts share: the repository root, argument parsing
and the token-file parser. `fixtures/check-fixtures.html` holds the states
`check.mjs` must see that no card or specimen shows.

Every script prints its usage with `--help`. A relative path is taken from the
repository root, so the scripts behave the same from any directory.
`verify-contrast.mjs` and `check.mjs` read `design-system/medaris-unified` when
no directory is given. Exit codes: 0 passed, 1 a check failed, 2 bad arguments.
`check.mjs` also exits 1 when its browser run breaks off; it prints what it
found before that.

## The full check

Run these five in order. Each must exit 0.

```sh
node tools/design-system/regen.mjs design-system/medaris-unified /tmp/regen --check
node tools/design-system/icons.mjs --dir design-system/medaris-unified --check
node tools/design-system/smoke.mjs design-system/medaris-unified
node tools/design-system/verify-contrast.mjs
node tools/design-system/check.mjs
```

When `regen.mjs --check` fails, regenerate (below). When `icons.mjs --check`
fails, run it without `--check`, then regenerate. When `verify-contrast.mjs`
says only that `contrast.md` or the contrast card is stale, run it with
`--write`. When it names a card ratio that `contrast.md` does not list, correct
the card by hand.

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

Run `icons.mjs --dir design-system/medaris-unified` first when the sprite or
`icon-masks.json` changed: it edits `Icon.jsx`, which the bundle is built from.

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
  value rule. Inherited members (`extends React.…HTMLAttributes`) are not
  read, so a native attribute a component's examples rely on (`checked`,
  `onChange`, `type`) is redeclared in its Props interface.

## What check.mjs renders

- `specimens/specimen-*.html`, when the directory has specimens. They are full
  product pages: 1440px wide, 390px for `specimen-mobile.html`.
- Every `*.card.html` in `components/`, `foundations/`, `patterns/` and
  `templates/`, at the size its `@dsCard` line gives.
- `fixtures/check-fixtures.html`, served one level below the directory, so its
  `../styles.css` is the directory's own.

A same-origin frame inside a page, such as a card's phone-width `srcdoc`
iframe, is measured and tabbed through like the page around it.

The four theme paths are light, dark by system preference, dark by
`data-theme="dark"` on `<html>`, and a night island: the whole body inside a
`<div data-theme="dark">` on a light page. A finding starts with the rule id
from `rules.md` it breaks. `TOKEN`, `RESOLVE`, `THEME`, `CONTRAST`, `CARD`,
`MISSING` and `FONTS` name a check instead.

## Limits

- The adherence rules can never allow `aria-*`, `data-*` or any other
  hyphenated attribute on a component: the member pattern takes only `\w+`
  names, so `<Input aria-label="…">` always draws a warning.
- `smoke.mjs` renders on the server (`react-dom/server`): effects do not run and
  there is no DOM. A component that gains a required prop needs a sample in
  `SAMPLES`.
- `verify-contrast.mjs` checks the pairs listed in the script. A new colour
  role, or a new ground that text can sit on, needs a line in its category.
  The colour vocabulary has a ceiling (`COLOUR_ROLE_CEILING`); raise it only by
  decision.
- `check.mjs` measures text against background colours. It does not see an
  image or a gradient under text. That is why `verify-contrast.mjs` computes
  the media scrim.
- `check.mjs` measures text inside an element with `opacity` below 1 but does
  not hold it to a threshold. A form control under an opacity below 1 fails on
  its own (MDS-A11Y-11), and a select's shown value is measured like text.
- The hover pass forces `:hover` on every hoverable element at once, with
  transitions off. A real pointer hovers one element and its ancestors, so a
  rule that reads a sibling's hover (`:has(:hover)`, `+`) is measured in a
  state no pointer makes. The pass measures contrast only, in the light and
  data-theme paths; forced colours are not rendered.
- `check.mjs` moves focus with Tab only. In a radio group, Tab reaches one
  radio; the others are reached with the arrow keys and are not visited.
- The Turkish glyph gate draws the faces, sizes and weights in `FACES`. A class
  that sets a new size or weight needs a line there.
- `icons.mjs` writes only the mask image. The section that asks for a mask sizes
  it and sets its colour, repeat and position; a glyph drawn as a mask vanishes
  in forced colours unless that section sets `forced-color-adjust: none` and a
  system colour.
