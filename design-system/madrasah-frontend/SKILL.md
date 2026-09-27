---
name: madrasah-design
description: Use this skill to generate well-branded interfaces and assets for Medaris / Online Madrasah (the Tedris student app and Nizam müderris management app), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for protoyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Start here

Everything lives in `packages/design-system/`:

1. `GUIDE.md` — product context, CONTENT FUNDAMENTALS, VISUAL FOUNDATIONS, ICONOGRAPHY.
2. `DESIGN_RULES.md` — the enforceable rules. Read before writing any UI.
3. `SYNC.md` — the design↔codebase sync contract. Read before editing anything the
   codebase consumes.
4. `tokens/tokens.json` — every token value.
5. `src/components/` — React components, each with a `.prompt.md` explaining what it is
   and when to use it.
6. `docs/kits/tedris/` and `docs/kits/nizam/` — full screen recreations built from those
   components; the best starting point for a new screen.

`design-sources/` (project root) holds the original design exploration and is provenance
only — read it to settle a question, never import from it.

## The two apps

- **Tedris** (talebe/student): content-first, roomy, blue accent, informal Turkish.
- **Nizam** (müderris/teacher): dense, sidebar + panel, green *only* for create actions,
  formal Turkish.

## Hard rules worth repeating

- Turkish UI copy with Ottoman-madrasah vocabulary (köşk, ders, müderris, talebe, müfredat,
  müzakere, icâzet) — never modernise or translate it. Keep diacritics.
- Arabic content is Amiri, RTL, line-height 2.
- Use tokens; never hardcode a value. Never round 7/9/11/13.5px to a 4px grid.
- Hairline borders, not shadows. No colored left-border cards. No emoji. No gradients as decoration.
- Green means "create", in Nizam only.
- Live lessons store a URL; the platform is resolved from it, not selected.

## After editing the system

```bash
cd packages/design-system
node tools/build-tokens.mjs && node tools/build-docs.mjs && node tools/manifest.mjs
```
