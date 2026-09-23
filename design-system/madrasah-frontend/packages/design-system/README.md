# @medaris/design-system

Design tokens, design rules and React components for **Medaris / Online Madrasah** —
shared by **Tedris** (talebe-facing learning app) and **Nizam** (müderris-facing
management app).

```
packages/design-system/
├── tokens/tokens.json      ← CANONICAL source of truth. Edit only this.
├── tools/build-tokens.mjs  ← zero-dependency token generator
├── tsup.config.ts          ← dist build (only needed to publish outside the monorepo)
├── src/
│   ├── css/                ← generated CSS custom properties (+ hand-written fonts.css, base.css)
│   │   └── index.css       ← the single import consumers link
│   ├── components/         ← React components, one folder per group, each with a barrel
│   │   ├── brand/ core/ forms/ navigation/ data/ feedback/
│   │   └── index.ts        ← every component
│   ├── tokens.ts           ← generated: typed values + var() references
│   ├── tailwind-preset.js  ← generated: Tailwind theme mapped to the CSS vars
│   └── index.ts            ← tokens + every component
├── DESIGN_RULES.md         ← the rules an agent/engineer needs to build correctly
├── package.json
└── project.json            ← nx targets: tokens, build, check-tokens, typecheck
```

| group | components |
|---|---|
| `brand` | `Icon` `Logo` `CoverPattern` |
| `core` | `Button` `IconButton` `Badge` `Pill` `Avatar` `AvatarStack` `Card` `ProgressBar` `ProgressRing` |
| `forms` | `Field` `Input` `Textarea` `Select` `CheckboxRow` |
| `navigation` | `Breadcrumb` `Tabs` `SidebarItem` |
| `data` | `DataTable` `WeekAccordion` `LessonRow` |
| `feedback` | `Dialog` `Toast` |

## Consuming

### 1. Wire the path mapping (once)

```jsonc
// tsconfig.base.json
{
  "compilerOptions": {
    "paths": {
      "@medaris/design-system": ["packages/design-system/src/index.ts"],
      "@medaris/design-system/*": ["packages/design-system/src/*"]
    }
  }
}
```

nx apps import the **source**, not `dist` — that keeps HMR, go-to-definition and
incremental rebuilds working. `nx build design-system` is only needed to publish the
package outside this monorepo.

### 2. Import the CSS once, at the app root

```ts
import "@medaris/design-system/css";
```

Without this, every component renders unstyled — they are built entirely on the CSS
custom properties that file defines.

### 3. Use components

```tsx
import { Button, Card, Badge, Icon } from "@medaris/design-system";

// or narrow, per group:
import { Button, Card } from "@medaris/design-system/core";
import { WeekAccordion, LessonRow } from "@medaris/design-system/data";
import { Icon } from "@medaris/design-system/brand";

<Card app="nizam" media={<CoverPattern hue={165} height={150} />}>
  <Badge tone="published" shape="chip">Yayında</Badge>
  <Button variant="create" icon={<Icon name="plus" size={16} />}>Yeni Ders Aç</Button>
</Card>
```

Subpaths: `/brand` `/core` `/forms` `/navigation` `/data` `/feedback`, plus
`/components` for all of them.

Every component ships a `.d.ts` with documented props and a `.prompt.md` explaining
when to reach for it. Components carry **no internal state beyond UI disclosure** and take
no data-fetching responsibility — they are presentational.

### 4. Tailwind (optional)

```js
// tailwind.config.js
module.exports = {
  presets: [require("@medaris/design-system/tailwind-preset")],
  content: ["./apps/**/*.{ts,tsx}", "./packages/**/*.{ts,tsx}"],
};
```

`bg-surface-alt`, `text-muted`, `rounded-card`, `shadow-toast` then resolve to the CSS
variables — no duplicated palette in the Tailwind config.

### 5. Token values in TS (rarely needed)

```ts
import { tokens, cssVar } from "@medaris/design-system";
tokens.colorAccentAccent;  // "#1d4ed8"
cssVar.colorAccentAccent;  // "var(--accent)"   ← prefer this
```

## Changing a token

1. Edit `tokens/tokens.json` — nothing else.
2. `nx build design-system` (or `node tools/build-tokens.mjs`).
3. Commit the regenerated `src/` output.

`nx check-tokens` fails CI if `src/` is stale relative to `tokens.json`.

Each token carries its exact CSS variable name in `$name`, so generation is lossless and
the CSS var names never drift from the JSON. The format is DTCG-flavoured
(`$value`/`$type`/`$description`), so Style Dictionary or Tokens Studio can read it
if you later want Figma sync.

## Syncing with the design project

**SYNC.md** is the contract: which files may be hand-edited and by whom, which are
generated and must never be merged, and how a change travels in each direction.
Read it before editing anything that exists on both sides.

**PROMPTS.md** carries the copy-pasteable prompts for both sync directions, plus the
standing rules to paste into the repo's `CLAUDE.md`.

## For a design-sync agent

Read **DESIGN_RULES.md** first — it is written to be the whole briefing. In short:
tokens over raw values, never round the odd pixel values, Tedris ≠ Nizam personality,
Turkish madrasah vocabulary, hairlines over shadows, green means "create" in Nizam only.

## nx targets

| target | what it does |
|---|---|
| `nx tokens design-system` | regenerate CSS / TS / Tailwind from `tokens.json` |
| `nx build design-system` | tokens, then `tsup` → `dist/` (ESM + CJS + types) |
| `nx manifest design-system` | restamp `MANIFEST.json` (run after every change) |
| `nx verify-sync design-system` | fail CI if any synced file drifted from the manifest |
| `nx check-tokens design-system` | fail CI if generated `src/` is stale |
| `nx typecheck design-system` | type-check the package |

## Caveats

- **Components are `.jsx`, not `.tsx`**, with hand-written sibling `.d.ts` files. They
  type-check and autocomplete correctly for consumers, but the implementations themselves
  are not type-checked. Converting them to `.tsx` is a mechanical follow-up worth doing
  once the package is wired into a real app.
- **Fonts are CDN-hosted** (Google Fonts: Inter, Amiri). Self-host the binaries and swap
  `src/css/fonts.css` for real `@font-face` rules before production.
- **Styling is inline `style` props** driven by CSS variables — deliberately, so the
  package has no CSS-in-JS runtime and no build-order coupling. It does mean consumers
  cannot override with a class name; use the `style` prop, which every component forwards.
- **No dark mode** is defined. Do not invent one; ask design first.
- `tsup` and `typescript` are declared as devDependencies but are not installed here —
  run `npm install` in the monorepo before `nx build design-system`.
