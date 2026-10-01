# @medaris/tokens

Design tokens package for Madrasah projects, optimized for Tailwind CSS v4 with semantic naming conventions.

## Installation

```bash
npm install @medaris/tokens
```

## Architecture

This package provides a clean, semantic token system with domain-specific namespacing:

- **Background Colors**: `--background-color-{category}-{variant}`
- **Text Colors**: `--text-color-{category}-{variant}`
- **Border Colors**: `--border-color-{category}-{variant}`

### Token Categories

- **neutral**: Neutral grays and whites
- **neutralinverse**: Dark theme variants
- **brand**: Primary brand colors
- **success**: Success states and feedback
- **warning**: Warning states and alerts
- **error**: Error states and validation
- **info**: Information and links

### Token Processing Workflow

1. **Design in Figma**: Create your design tokens in Figma
2. **Export from Figma**: Use the [Tailwind Theme Gen](https://www.figma.com/community/plugin/1384511746402383895/tailwind-theme-gen) plugin to export theme variables
3. **Import to Package**: Place the exported variables in `input/main.css`
4. **Process**: Run `npm run process` to generate `theme/main.css` with semantic naming
5. The processed file contains semantic tokens with direct color values

#### Figma Integration

The [Tailwind Theme Gen](https://www.figma.com/community/plugin/1384511746402383895/tailwind-theme-gen) Figma plugin allows you to:

- Export design tokens directly from your Figma design system
- Generate CSS variables in the correct format
- Maintain consistency between design and code

Simply export your tokens from Figma and paste them into `input/main.css`, then run the processing workflow.

Example transformation:

```css
/* Input (from Figma export in input/main.css) */
--color-semantic-text-primary: rgba(17, 24, 39, 1);

/* Output (processed in theme/main.css) */
--text-color-neutral-primary: rgba(17, 24, 39, 1);
```

## Usage with Tailwind CSS v4

Tailwind CSS v4 reads CSS variables directly, so you just need to import the theme CSS file:

### 1. Import in your CSS

```css
/* globals.css or main.css */
@import "@medaris/tokens/css";
@import "tailwindcss";
```

### 2. Use in your components

```jsx
// Tokens are available as Tailwind utilities with semantic naming
<div className="bg-neutral-primary text-neutral-primary border-neutral-primary">
  <h1 className="text-brand-primary">Hello World</h1>
  <p className="text-neutral-secondary">
    This uses semantic design tokens
  </p>
  <button className="bg-success-bold text-success-inverse">
    Success Button
  </button>
</div>
```

## JavaScript API

You can also import tokens as JavaScript objects:

```javascript
import tokens from "@medaris/tokens";

// Access parsed token values
console.log(tokens["background-color-brand-primary"]); // rgba(12, 74, 110, 1)
console.log(tokens["text-color-neutral-primary"]); // rgba(17, 24, 39, 1)
```

## CSS Custom Properties

All tokens are available as CSS custom properties:

```css
.my-component {
  color: var(--text-color-brand-primary);
  background: var(--background-color-neutral-primary);
  border-color: var(--border-color-neutral-primary);
}
```

## Tailwind CSS Classes

With Tailwind v4, semantic tokens work seamlessly with utilities:

```css
/* These are automatically available in Tailwind */
.bg-background-neutral-primary {
  background-color: var(--background-color-neutral-primary);
}
.text-text-brand-primary {
  color: var(--text-color-brand-primary);
}
.border-border-success-primary {
  border-color: var(--border-color-success-primary);
}
```

## Generated and hand-authored files (MDRS-73)

`@import "@medaris/tokens/css"` resolves to `theme/index.css`, which imports
six files. Only one of them is generated:

| File | Made by | Holds | Figma source |
| -- | -- | -- | -- |
| `theme/main.css` | **generated** by `scripts/process-tokens.js` from `input/main.css` | `--background-color-*`, `--text-color-*`, `--border-color-*` (70) | collection `color`, semantic layer, via the Tailwind Theme Gen export |
| `theme/icon-colors.css` | hand | `--icon-color-*` (22) | collection `color`, semantic `icon` role |
| `theme/typography.css` | hand | `--font-cairo`, `--font-ibm-plex-sans`, `--font-weight-*`, `--text-<display…footnote>`, `--line-height-*`, `--letter-spacing-*` | collection `typography` |
| `theme/spacing.css` | hand | `--space-xs … --space-4xl`, `--bp-mobile/tablet/desktop` (values only, not Tailwind breakpoints) | collection `typography` (spacing), Design System page frames |
| `theme/radius.css` | hand | `--corner-radius-xxs … -full`, `--border-weight-xs … -l` | collection `size` |
| `theme/elevation.css` | hand | `--shadow-2xs … --shadow-2xl`, `--shadow-focus`, `--shadow-focus-error` | effect styles |

**Why the split.** `process-tokens.js` rewrites `theme/main.css` whole every
time it runs and touches nothing else, and the Tailwind Theme Gen export it
reads has no icon role and drops every non-colour variable. Everything the
export cannot carry therefore lives in a sibling file the script never
opens. Edit `input/main.css` and re-run `pnpm nx run tokens:process` for the
three colour roles; edit the sibling directly for everything else. Each
sibling's header names the Figma collection its values were read from and
the mirror file in `design-system/tokens/` they match — the test suite
checks both, and a value marked `PROPOSAL` is one the design system proposes
rather than one the `.fig` contains.

**Why some names are not the Figma names.** These files sit in `@theme`
next to Tailwind's defaults, and several Figma names already mean something
there: `--spacing-md` would turn every `max-w-md` into 16px, `--radius-xl`
and `--radius-full` would restyle `rounded-xl` and `rounded-full`,
`--border-width-s` and `-l` would collide with `border-s` and `border-l`,
`--leading-tight` / `--tracking-tight` have other values, and
`--breakpoint-*` would add `container` steps in every app. The families
that would collide use their own names (`--space-*`, `--bp-*`,
`--corner-radius-*`, `--border-weight-*`, `--line-height-*`,
`--letter-spacing-*`) and are used as `p-(--space-md)`,
`rounded-(--corner-radius-m)` or `var(--space-md)`. The seven shadows keep
Tailwind's names and Tailwind's notation because they are the same shadows
(the Figma file lists each pair of layers in the opposite order).
`test/tailwind-defaults.spec.ts` compiles the existing utilities with the old
and the new entry point and requires identical output; the compiled CSS of
the four Next apps was also compared before and after and is byte-identical.

Tailwind emits a theme variable only when something uses it, so importing
the package adds no CSS until a token is referenced.

## Development

```bash
npm run process  # Process input/main.css → theme/main.css
npm run build    # Validate package structure
pnpm nx test tokens  # the MDRS-73 suite (Vitest, no network, no Docker)
```

### Workflow

1. **Edit Tokens**: Modify `input/main.css` with your design tokens
2. **Process**: Run `npm run process` to generate semantic tokens with proper namespacing
3. **Build**: Run `npm run build` to validate the package
4. **Use**: Import the processed tokens in your projects

### Example Token Structure

```css
/* input/main.css */
@theme {
  --color-semantic-text-neutral-primary: rgba(17, 24, 39, 1);
  --color-semantic-background-brand-primary: rgba(12, 74, 110, 1);
  --color-semantic-border-success-primary: rgba(4, 120, 87, 1);
}

/* theme/main.css (generated) */
@theme {
  --text-color-neutral-primary: rgba(17, 24, 39, 1);
  --background-color-brand-primary: rgba(12, 74, 110, 1);
  --border-color-success-primary: rgba(4, 120, 87, 1);
}
```

## License

ISC
