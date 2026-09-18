# MDRS-80 — `DataTable` off react-table v9's `/legacy` surface

## Problem

MDRS-21 (PR #62) upgraded `@tanstack/react-table` to v9 and ported both
`DataTable` trees onto `useLegacyTable` from `@tanstack/react-table/legacy`.
That kept the API change out of the dependency upgrade. The cost:
`useLegacyTable` registers every stock feature, so the one change v9 makes for
bundle size (features are opt-in and tree-shake) did not apply. The issue
recorded that nobody had measured the difference.

## What changed

Fourteen files in two apps, plus one new file in `@medaris/ui`. The same
change was applied to both apps.

- **`libs/ui/src/lib/data-table-features.ts` (new), imported by both apps as
  `@medaris/ui/lib/data-table-features`.** The first revision of this PR
  added it as a byte-identical `components/data-table/features.ts` in each
  app. Review pointed out that it is the type authority for both `DataTable`
  trees, so a feature registered in only one copy would type-check and then
  fail at render time; it now exists once. `libs/ui` gains
  `@tanstack/react-table` (`catalog:`) as a dependency. The file stays
  `scope:ui` / `platform:web`, which both apps may import. Registers `tableFeatures({ columnSizingFeature })` and exports the table's
  types with the feature set baked in: `DataTableColumnDef`,
  `DataTableCellContext`, `DataTableOptions`. The column hooks and editable
  cells import these types instead of `LegacyColumnDef` / `LegacyFeatures`.
- **`components/data-table/index.tsx`.** `useLegacyTable` becomes `useTable`
  with `features: dataTableFeatures`. `getCoreRowModel()` is removed, because
  v9 always includes the core row model. The `options` prop becomes
  `Partial<Omit<DataTableOptions<TData>, "data" | "columns" | "defaultColumn" | "meta">>`
  and is spread first, so the component's own keys always win. No caller passes
  it. Plain `Partial<DataTableOptions>`, as the first revision had it, would
  have let an `options.meta` replace the component's `meta` and silently drop
  `updateData`: editable cells would stop saving with no error, because
  `editable-cell.tsx` calls it through optional chaining.
- **`editable/*.tsx` and the three `use*Columns.tsx` hooks.** Only the type
  imports change, plus `EditableCell`'s props type
  (`CellContext<LegacyFeatures, …>` becomes `DataTableCellContext<TData>`).
  The actions columns also lose `enableSorting: false` and
  `enableColumnFilter: false`. With only column sizing registered, no feature
  reads those keys, and leaving them in suggests the table can sort or filter.
- **No `@tanstack/react-table/legacy` import remains under `apps/`.**

### Two calls the issue's inventory missed

The issue named column sizing as the only feature in use. `DataTable` also
called:

| Call | Feature it needs in v9 | What it did here | Replacement |
| --- | --- | --- | --- |
| `row.getIsSelected()` | `rowSelectionFeature` | Always `false`: nothing sets selection state, and no caller passes `options`. It rendered `data-state="false"` on every row. | Removed. The row's only selection style is `data-[state=selected]:bg-muted`, which `"false"` never matched, so the look does not change. |
| `row.getVisibleCells()` | `columnVisibilityFeature` | Returned every cell, because nothing hides a column | `row.getAllCells()` (core) |

Registering the two features would also have compiled. It was not done
because it would ship two features just to keep an attribute that was always
`false` and a filter that never filters.

## Bundle size — measured

**Method.** Both apps built with `pnpm nx run-many -t build -p <app>
--skip-nx-cache` (Next 16.3.4, Turbopack), once on `origin/main` `9cf36a8` and
once on this branch. For each route that mounts a `DataTable`, the loaded JS is
`build-manifest.json`'s `rootMainFiles` plus every `entryJSFiles` entry in that
route's `page_client-reference-manifest.js`. Sizes are summed raw and with
gzip level 9. "react-table chunk" is the one chunk in that set that contains
table-core code; it is a single chunk both before and after. `next build` no
longer prints per-route sizes, which is why the method is spelled out.

| App | Route | Route JS, raw | Route JS, gzip | react-table chunk, raw | react-table chunk, gzip |
| --- | --- | --- | --- | --- | --- |
| nizam | `/[locale]/decks` | 1,320,953 → 1,245,583 (**−75,370**) | 366,134 → 347,751 (**−18,383**, −5.0 %) | 122,008 → 46,638 | 32,410 → 14,027 |
| nizam | `/[locale]/decks/[id]/cards` | 1,337,344 → 1,261,974 (**−75,370**) | 370,083 → 351,700 (**−18,383**, −5.0 %) | 122,008 → 46,638 | 32,410 → 14,027 |
| tedris | `/[locale]/decks/[id]/cards` | 1,354,902 → 1,279,529 (**−75,373**) | 376,586 → 358,205 (**−18,381**, −4.9 %) | 120,701 → 45,328 | 32,214 → 13,833 |

All numbers are bytes. The whole route shrinks by exactly as much as the
react-table chunk does, so no other chunk moved. The table code on these routes
is 62 % smaller: about 18 KB less gzip per route that mounts a table.

## Behaviour — verified

There is no frontend test runner yet (see `README.md`, "Test coverage, stated
honestly"), so equivalence was checked with a throwaway harness that is not
committed. esbuild bundles the **real** `DataTable`, `createDefaultColumn` and
column hooks with `NextIntlClientProvider` and the real `tr` messages, and
renders each call site with `react-dom/server`:

- tedris `useFlashcardColumns(true)`, `useFlashcardColumns(false)`, empty data;
- nizam `useDecksColumns()`, `useFlashcardColumns()`, empty data.

Each call site gets a probe column with `size: 77`. Its cell captures
`table.options.meta`, and the harness then calls
`meta.updateData(1, "contentFront", "defter")` and `meta.onRowDelete("c1")`.

The harness ran on `origin/main` (changes stashed) and on this branch, and the
outputs were diffed:

- **The only difference is `data-state="false"` disappearing from body rows**
  (4 rows per app), as the table above predicts.
- Header and cell widths (`style="width:…"`, which exercises `defaultColumn`
  sizes, per-column sizes and the probe's 77), every rendered cell, the
  empty-state row, the meta keys (`loadingCells, onRowClick, onRowDelete,
  updateData`), the merged row passed to `onRowUpdate`, and the id passed to
  `onRowDelete` are all identical.
- **Fail-closed check:** with `tableFeatures({})` in place of the column-sizing
  registration, the harness fails with `TypeError: header.getSize is not a
  function`. A missing feature is therefore a render-time crash, not a silent
  change, and that is why `data-table-features.ts` warns about it.

The harness ran on the first revision of this PR. It was **not** re-run after
the review follow-up, which moved `features.ts` into `@medaris/ui`, narrowed
`options`, reordered its spread and dropped the two inert column keys. None of
those change what renders when no caller passes `options`, which is every call
site today. After the follow-up, typecheck, lint, module-boundaries, test and
build for `tedris-web`, `nizam-web` and `ui` were re-run and are green.

**Not verified:** interactive behaviour in a browser (typing in an editable
cell, blur, the delete dialog). Those code paths were not changed. The update
and delete callbacks they end in are the ones exercised above.

## Biome ratchet

The issue asked for the warning count to come down here. It cannot, and that
has been measured: `components/data-table/**` and the column hooks carry
**no** Biome diagnostics on `origin/main`. MDRS-21 already fixed the 13
warnings its port added (see
`docs/migration/mdrs-21-dependency-upgrade.md`). `biome check` on those
directories, run on `origin/main` and on this branch, reports no diagnostics
either time. The remaining 79 warnings are all in other files. This change
keeps the count at 79 and does not take on clearing them.

## Gate

Run with `--skip-nx-cache` and Docker running: typecheck (17 projects), lint
(17), module-boundaries (17), build (8) and test (5 projects; tedrisat
`tests="377" failures="0"`) all green. `pnpm run security-check` exits 0.
`tools/ci/biome-ratchet.mjs` shows `warnings 79 (baseline 79)`, and one
`format` error that comes from the untracked, git-excluded
`.cursor/mcp.json` in this checkout; it reproduces on `origin/main`.
