# MDRS-153 — the form half of the unified kit, on Base UI

MDRS-153 is package 23 of the screen-canvas plan: the form components of the
unified design system as React components in `libs/ui`, on `@base-ui/react`.
No screen is built here; the screens that consume the kit start with package 25.

## What was done

- `@base-ui/react` `^1.8.0` joined the workspace catalog and `libs/ui`
  (installed: 1.8.0). The old `@base-ui-components/react` is not used. It is an
  external package, so no Dockerfile changed.
- Twelve components in `libs/ui/src/mds/`, each a thin wrapper that takes
  behaviour from Base UI and its look from the `.mds-*` class layer. Imports are
  `@medaris/ui/mds/<file>`, the export that `Logo` and `Icon` already use.

  | File | Component | Base UI parts |
  | -- | -- | -- |
  | `button.tsx` | `Button` | `Button`; a link stays `<a class="mds-btn">` |
  | `icon-button.tsx` | `IconButton` | `Button` + `Tooltip` |
  | `field.tsx` | `Field` | `Field.Root/Label/Description/Error` |
  | `input.tsx` | `Input` | `Field.Control` |
  | `textarea.tsx` | `Textarea` | `Field.Control render={<textarea />}` |
  | `select.tsx` | `Select` | `Select.Root/Trigger/Value/Portal/Positioner/Popup/List/Item/ItemText` |
  | `checkbox.tsx` | `Checkbox` | `Checkbox.Root`, no Indicator |
  | `radio-group.tsx` | `RadioGroup` | `RadioGroup`, `Radio.Root`, no Indicator |
  | `switch.tsx` | `Switch` | `Switch.Root`, no Thumb |
  | `choice-chips.tsx` | `ChoiceChips` | `ToggleGroup` + `Toggle` |
  | `tabs.tsx` | `Tabs`, `TabsPanel` | `Tabs`, `activateOnFocus`, no Indicator; `mode="links"` is a `<nav>` |
  | `tooltip.tsx` | `Tooltip`, `TooltipProvider` | `Tooltip`, no Arrow |

  Their markup follows each component's `.prompt.md` in
  `design-system/medaris-unified/components/`.
- `libs/ui/src/styles/mds/baseui.css`, imported by `medaris.css` into the
  components layer. `components.css` is untouched (it is a verbatim copy that
  `sync-libs.mjs --check` guards), so the Base UI twins of its native state
  selectors (`:checked` → `[data-checked]`, `:disabled` → `[data-disabled]`,
  `[aria-invalid]` → `[data-invalid]`, `[aria-selected]` → `[data-active]`) and
  the two parts the system lacks (`.mds-popup`, `.mds-option`, for the Select's
  open list) live in this one file.
- `libs/ui` got its first test target: `vitest.config.ts`, a `test` script,
  `vitest` and `happy-dom` from the catalog. Specs are in `libs/ui/test/`.

## Decisions that differ from the canvas notes

- **The shadcn files stay.** `_kurallar.md` 34 says to rewrite the components
  at their current paths. 40 files import `components/button`, 14 `input`,
  10 `label`, 7 `select`, 5 `textarea`, 4 `checkbox`, 3 `switch` and 2
  `tooltip`, all through the shadcn/Radix API (`asChild`, `SelectTrigger`,
  `variant="default"`…), which the new components do not have. Replacing them in
  place would break those apps in a package that has no screens. The new
  components sit beside them in `src/mds/`; each app moves over in its own
  package, and `components/*.tsx`, the Radix dependencies and `tw-animate-css`
  go when the last consumer does (rule 42).
- **`Select` is Base UI, not native.** Rule 23 leaves it open ("short lists
  native"). One component with the open list drawn by the class layer avoids two
  Selects for the same job; a native one can be added later without changing
  this one.
- **`Switch`, `Checkbox`, `Radio` are not `<input>`s.** Base UI renders a
  `span` with a role and a hidden input, so a user toggles them by clicking the
  label, which is the hit area.
- **The busy-button status region is an `<output>`**, which has the implicit
  `status` role; Biome's `useSemanticElements` rejects `role="status"` on a
  `span`.

## What was verified

- `pnpm nx test ui`: 27 specs in 4 files, in happy-dom. They assert the markup
  contract: classes, roles, `aria-*`/`data-*`, label wiring, help replaced by
  error, busy button (no `disabled`, click/Enter/Space swallowed), disabled
  link, uncontrolled/controlled chips and radios with nothing selected by
  default, Select placeholder and choice, tooltip show on focus and Esc.
- Of the "not verified" list in `_kurallar.md` 20, measured here in happy-dom:
  Tabs set `aria-selected` on the tab; Toggle sets `aria-pressed`; Field
  sets `aria-invalid` and `data-invalid` on the control; Tooltip hides on Esc.
- The gate, run with `--skip-nx-cache` in this worktree: `typecheck`, `test` (with Docker), `build`, `lint` and `module-boundaries` each exited 0; `node tools/ci/biome-ratchet.mjs` reports 0 errors, 74 warnings (baseline 74).

## What was not verified

- **Nothing was rendered in a real browser.** happy-dom does not lay out CSS,
  so the look, the focus ring, the day/night pairing against the canvas, the
  Select popup placement and the label-click behaviour of the span-based
  controls (a happy-dom click on the span itself fires the label's activation a
  second time; Base UI documents the label-wrapping pattern, but it was not
  confirmed in Chromium) are unchecked.
- **No Playwright e2e.** The repository has no web e2e setup, and this package
  has no screen or API to run one against. The first package with a screen
  (25, the Keycloak pages) should set it up, once, as an Nx target.
- Rule 20's other items (`role="dialog"`/`alertdialog`, Accordion
  `aria-expanded`, Toast live regions, Progress width, CSP nonce) belong to the
  Dialog/Toast/Accordion/Progress components of package 24.
- `Form` JS-less native submit and `Field` validation modes were not exercised;
  `Field` only forwards the caller's `error`.
- Tooltip: `data-placement` collision handling of the system's JS is replaced
  by Base UI's Positioner; not compared with the canvas.
