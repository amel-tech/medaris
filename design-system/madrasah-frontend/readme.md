# Madrasah Design System — design file

Design system for **Medaris / Online Madrasah** (https://medaris.app) — the **Tedris**
(talebe) and **Nizam** (müderris) apps.

This file is the **authoring surface** — but not a gate. The system lives in
`packages/design-system/`, which is the same set of files in the nx codebase: the team
reads it from the repo, and engineers may change tokens and components there. Changes come
back here on a pull-back, where the reference screens are regenerated against them.

See `packages/design-system/SYNC.md` for the contract in both directions.

| path | what it is |
|---|---|
| `packages/design-system/` | **the design system.** Tokens, components, rules, docs — everything that ships |
| `packages/design-system/docs/index.html` | the browsable entry point: guide, rules, components, reference screens |
| `packages/design-system/SYNC.md` | **how the team works with it** — sync contract, roles, guardrails |
| `packages/design-system/GUIDE.md` | product context, content fundamentals, visual foundations, iconography |
| `design-sources/` | the original design exploration — provenance only, not vendored |
| `index.html` | design canvas: opens every screen and layout exploration in `design-sources/` |
| `SKILL.md` | Agent Skills entry point |

## Working here

Edit tokens in `packages/design-system/tokens/tokens.json`, components in
`packages/design-system/src/components/`. Then, always:

```bash
cd packages/design-system
node tools/build-tokens.mjs   # regenerate CSS / tokens.ts / tailwind-preset
node tools/build-docs.mjs     # rebuild the docs component bundle
node tools/manifest.mjs       # restamp the fingerprint
```

Skipping the second step is the usual mistake: the reference screens keep rendering the
previous version and you chase a bug that is not there.

Read `packages/design-system/SYNC.md` before changing anything the codebase consumes.
