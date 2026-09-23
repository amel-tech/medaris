# Provenance — `madrasah-frontend`

This directory is **not part of the Medaris Design System mirror**. It is a
contribution waiting to be pulled into the canonical claude.ai/design project,
and it lives here because that is the only route between two claude.ai/design
projects that cannot be shared with each other.

| | |
| -- | -- |
| Source | claude.ai/design project **madrasah-frontend**, id `97374549-58bc-4a6c-a915-b3bcd421721b`, `PROJECT_TYPE_PROJECT`, owner Samet |
| Exported | 2026-09-23, as the project's zip export; 164 files copied verbatim and `cmp`-verified against the zip (MDRS-93) |
| Destination | the canonical **Medaris Design System** project (`628e070f-f5b9-4a3c-b9c7-8e107fceab82`, owner Taha), by design sync from this repo |
| After the pull | this directory is dropped from the repo on the next mirror refresh, and the source project is retired |

## What is here

Everything the source project holds except the items listed under *Not
carried*. The paths are the project's own, so its relative links resolve as
they did there: `styles.css` at this root imports
`packages/design-system/src/css/index.css`, and every card and kit page links
that same file.

- `packages/design-system/` — the package the project's agent built from the
  screens: `tokens/tokens.json` (172 named tokens), 22 components under
  `src/components/{brand,core,data,feedback,forms,navigation}/` each as
  `.jsx` + `.d.ts` + `.prompt.md`, 20 foundation cards under
  `docs/foundations/`, the Tedris and Nizam kits under `docs/kits/` (8 screen
  files), and the four documents `DESIGN_RULES.md`, `GUIDE.md`, `SYNC.md`,
  `PROMPTS.md`. `README.md`, `package.json`, `project.json`, `tsconfig.json`
  and `tsup.config.ts` describe a workspace package that was never added to
  this repo and is not meant to be — see below.
- `design-sources/` — the original high-fidelity screens (11 `.jsx`
  files plus their `.html` hosts) the package was extracted from. Provenance,
  not a component library; the project's own `design-sources/README.md` says
  the same.
- `assets/` — the two brand marks, `logo-madrasah.svg` and `logo-nizam.svg`.
- `readme.md`, `SKILL.md`, `index.html`, `styles.css` — the project's root
  files. `index.html` is the design canvas that opens every screen in
  `design-sources/`.

## Not carried

- `_repo/` — a proposed rewrite of `libs/tokens` (a `tokens.json` source
  replacing the Figma export) and a `libs/design-system` package with four
  `.tsx` components. Not brought in: the canonical system decides what the
  tokens are, and the Figma pipeline in `libs/tokens` is covered by MDRS-73.
- `_check/tokens.html` — a scratch page the agent used to check that the
  generated CSS resolved.
- `uploads/` — six screenshots of the live Nizam app the Nizam screens were
  recreated from. Not design.
- `sync-architecture.html` — the agent's own write-up of how it intended to
  sync to this repo; superseded by this file.
- `.thumbnail`, `.design-canvas.state.json` — project card and editor state.

## How this differs from the canonical system

These are the things whoever pulls this into the canonical project has to
reconcile. None of them is resolved here; the files are verbatim.

| | This contribution | Canonical system (`design-system/` root) |
| -- | -- | -- |
| Token names | flat: `--accent`, `--ink`, `--muted`, `--line`, `--r-card`, `--fs-14` | role × tone semantic layer over primitive ramps: `--background-brand-primary`, `--text-neutral-secondary` |
| Brand colour | `--brand-navy` `#0b1f3a`, Tedris accent `--accent` `#1d4ed8`, Nizam create `--green` `#0f9d63` | sky ramp, `--background-brand-primary` = `sky-900` `#0C4A6E` |
| Type | Inter for everything, Amiri for Arabic (CDN, `src/css/fonts.css`) | Cairo headings, IBM Plex Sans body and controls, IBM Plex Sans Arabic |
| Scale | 10 → 34px with half steps (11.5, 12.5, 13.5, 14.5) that the rules say not to round | the Figma scale, 14px Medium for the whole control layer |
| Styling | inline `style` props on CSS variables; no class layer | `.mds-*` classes in `components.css`; components are thin wrappers |
| Icons | hand-drawn 24×24 stroke set in `brand/Icon.jsx` | not decided in the canonical system |
| Values from | the screens in `design-sources/`, and screenshots of the live Nizam app | `Online Medrese UI UX.fig`, export 2026-09-04 |

What the canonical system does not have and this contribution does:

- Domain tokens: lesson types (`--type-video|doc|live|quiz`), meeting
  platforms (`--platform-meet|zoom|jitsi` and their `-soft` pairs), cover
  hues, per-app layout measures (`--sidebar-w`, `--aside-w`, `--pad-card-nizam`).
- Domain components: `CoverPattern`, `LessonRow`, `WeekAccordion`, `Pill`,
  `IconButton`, `Dialog`, `Toast`, `Select`, `Field`, `CheckboxRow`,
  `Breadcrumb`, `DataTable`, `Logo`, `Icon`.
- The rules: `DESIGN_RULES.md` §5–§8 (terminology, lesson-type taxonomy,
  platform resolution from the meeting URL, status vocabulary) and `GUIDE.md`
  (tone, copy, iconography).
- Whole screens: the Tedris and Nizam kits, and the layout explorations in
  `design-sources/`.

Where the two disagree on a *value* (brand colour, type family), the canonical
system wins; that was decided when it was made the source of truth (MDRS-92).
Where this contribution has something the canonical system lacks, it is the
material to add — re-expressed in the canonical token names and the `.mds-*`
layer, not copied as is.

## Rules for this directory while it is here

- Do not edit anything under it. It is a verbatim export; a change here would
  be lost on the pull and would make the `cmp` check meaningless.
- Nothing in `apps/` or `libs/` imports from it. `.dockerignore` excludes all
  of `design-system/`, so an import would pass every local gate and fail only
  inside the image.
- The mirror refresh in `.claude/skills/medaris-design-system/SKILL.md` §5
  must keep this directory until the canonical project contains it. Once it
  does, the refresh removes it like any other file that no longer exists
  remotely, and this note goes with it.
