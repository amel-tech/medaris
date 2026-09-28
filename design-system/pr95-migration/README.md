# Porting from madrasah-frontend (#95)

Temporary. Delete this directory when the MDRS-127 screens are ported. It sits beside the mirror
and is never pulled into the canonical project.

| file | holds |
| -- | -- |
| `pr95-map.json` | every #95 token (172), component export (28), sub-type (3), raw colour literal (8), implicit `base.css` rule, global and JS API, mapped onto the unified system in `design-system/medaris-unified/`; a `reserved` table gives the brief's likely additions a target |
| `pr95-copy-map.json` | copy: #95 and launch strings → the unified vocabulary |
| `pr95-value-bridge.css` | generated from the map, for the MDRS-127 project only |

Both maps are pinned to the #95 package fingerprint in `pin`; `pr95-map.json`'s `pin.recipe` says
how to recompute it. Each file describes its fields at the top. `MDS-*` rules and the `OPEN-n` /
`SPEC-D3-nn` decisions resolve in `medaris-unified/rules.md`, except SPEC-D3-17, which only this
directory uses and which *The value bridge* describes. The other values of a `decision`
field (`COL-…`, `K…`, `SPEC-D2-…`, `policy`, `D2`, `D3`) record where a row came from in the
MDRS-131 migration spec and its inventory reports; they are not instructions.

## The value bridge

SPEC-D3-17 is the owner's call: (a) rename only, after launch, or (b) this bridge now and the
rename after launch. The default is (b): the file is generated here, and loading it is the owner's
act.

Load `pr95-value-bridge.css` **after** the #95 CSS in the MDRS-127 project. 152 #95 names then
carry the unified values, written as literals because that project has no unified tokens; nothing
is renamed. The 8 property-dependent names, the 9 dropped names and the 3 names whose targets wait
on an open decision (`inherits` in the map: `--warning` and `--warning-bg` on OPEN-2,
`--focus-ring` on OPEN-1), all listed in the file's header, keep their #95 values until the port.
Bridged, #95 warning text would drop from 3.07:1 to 1.79:1 on its tint, and `--focus-ring`, a
colour in #95, would become a whole box-shadow at 1.26:1. The bridge carries values only: none of the unified
`base.css` behaviour (reduced motion, the forced-colours focus outline, the Arabic face on
right-to-left text), no `.mds-*` class, no copy. The unified system never loads it.

Regenerate it, never edit it, whenever the map or the unified tokens change. It reads
`medaris-unified/_ds_manifest.json`, so regenerate the `_ds_*` files first
(`tools/design-system/README.md`):

```sh
node tools/design-system/value-bridge.mjs design-system/pr95-migration/pr95-map.json design-system/medaris-unified design-system/pr95-migration/pr95-value-bridge.css
```

The same command with `--check` confirms the file is current. Take the bridge out of the MDRS-127
project once `check-port.mjs` lists no #95 token name in any of its screens.

## Porting a screen

Per file, in this order.

1. **Components.** For each #95 element, `components.<Name>`: rename the element to `to`; for each
   prop, `props.<p>.to` (null = delete), `values` for literal values, `transform` where the shape
   changes, `set` for props to add (CheckboxRow → `bordered`), `requires` for props the unified
   component needs (Table `caption`, Tabs `label` + `idBase`, NavItem `href`, Progress `label`,
   ChoiceChips `legend` + `name`), `container` for the class around it (SidebarItem →
   `.mds-nav--light`). `op: "restructure"` (Pill, SidebarItem, FILLED_ICON_NAMES) is not a rename:
   read `transform`. `review: true` (Badge `tone="live"`) is decided per use from
   `valueContexts`. Sub-types (`DataTableColumn`, `BreadcrumbItem`, `TabItem`) by `subTypes`.
   Every component file stands alone (MDS-COMP-06): pass components into slots.
   Some targets are contracts the unified system builds after launch; `check-map.mjs` prints them
   under *targets contracted but not built yet*. Port the tokens, literals and copy of a screen
   that needs one now, and the element when it is built, never with a stand-in (MDS-AGENT-03).
2. **Tokens, property by property.** For `var(--x)`: a matching `tokens[x].contexts[].when` wins;
   else `tokens[x].byProperty[<class>]` (text = color / caret-color / text-decoration-color; bg =
   background*; border = border* / outline*; icon = fill / stroke; ring = the focus box-shadow);
   else `tokens[x].to`. `kind: "dropped"`: the note says what decides instead. A context with
   `inherits` is a pair that waits on that open decision.
3. **The twelve silent names, and one silent prop value.** `--white`, `--slate-500`, `--slate-600`,
   `--font-ui`, `--font-arabic`, `--font-mono`, `--tracking-normal`, `--lh-tight`, `--lh-snug`,
   `--lh-body`, `--lh-arabic` and `--transition-disclosure` exist on both sides (`resolvesSilently`).
   A missed rename does not fail: the name silently takes the unified value. `check-port.mjs` lists
   them first, drift before benign. The same holds for `variant="ghost"` on `Button` and
   `IconButton`: #95's ghost has a border and is the unified `outline`; left as it is, it renders
   the unified ghost, which has none. `check-port.mjs` lists it as a silent prop value. Where the entry keeps the name, the change is the value, and
   `silentNote` says what to check. `--muted` and `--accent` are flagged too; they join the list
   only if SPEC-D3-19 keeps the canonical aliases.
4. **Literals and base behaviour.** `literals` for raw colours (a null target: the colour goes, the
   note says what takes its place); `css` for what #95's `base.css` did implicitly (links,
   `[dir=rtl]` / `.ar`) and for kit conventions (the `ar` / `backAr` data flags, bare Arabic runs,
   hue-templated colours); `globals` for `window.DS` / `window.MadrasahDS` (→ the unified bundle
   namespace); `jsApi` (`tokens`, `cssVar`, `TokenName` → write `var(--name)`).
5. **Arabic.** Wrap every Arabic run in `<span lang="ar" dir="rtl" class="mds-arabic">`; an `ar` /
   `backAr` data flag becomes `.mds-arabic-text` at render; user and author strings get
   `dir="auto"` or `<bdi>` (MDS-TYPE-07).
6. **Inline styles become classes;** a screen's own layout takes `gap` / `padding` from the scale.
7. **Copy** by `pr95-copy-map.json`: its rows in order, each only inside its `scope`. A null `to`
   removes the text or rewrites it as the note says; `contexts` are decided per use; a row with
   `openDecision` is a draft until that decision is made.
8. **Root:** `<html lang="tr" data-app="…">` (MDS-LAY-03); a sidebar's `<nav>` gets
   `.mds-nav--light` and an `aria-label` (SPEC-D3-04 default: ported screens keep a light
   sidebar). `.mds-nav--light` is contracted, not built yet (`medaris-unified/rules.md`,
   *Contracted, not built yet*): without it the nav items keep the inverse sidebar's colours,
   1.24:1 on white, so a sidebar waits for it as step 1 says.
9. **Run** `node tools/design-system/check-port.mjs <file-or-dir>`. It warns and exits 0; it reads
   this map and `design-system/medaris-unified` unless `--map` / `--ds` say otherwise. It prints each
   token's route (`byProperty` for the property it finds, `contexts`, the note) and lists every #95
   component whose target is not built yet: destructured from the unified namespace, such a name
   is `undefined`. Anything it
   lists that the map does not explain: stop and report it. A #95 name the map lacks is a bug in
   the map, never an alias (MDS-AGENT-02).
10. **Cards.** Once the screens are ported, the launch patterns are harvested from them into
    `patterns/*.card.html` of the unified system, not redrawn: `<html lang="tr" data-app="…">`,
    the `@dsCard` marker on line 1, then the `_ds_*` files regenerated (MDS-AGENT-03). They reach
    the canonical project through the owner's sync; the mirror stays read-only.

## Changing the map

After editing `pr95-map.json`, or when the unified tokens change:

```sh
node tools/design-system/check-map.mjs design-system/pr95-migration/pr95-map.json design-system/medaris-unified --before=design-system
```

Coverage is measured from the #95 package, so a #95 name the map lacks fails the run; every target
must be a token in the manifest, a known class, or a built, contracted or reserved component; the
silent names are recounted and the pin recomputed. `--write-pin` rewrites `pin` when those counts
change for a reason. `--before=design-system` compares with the canonical mirror, which holds only
while the mirror is the system from before this change. Then regenerate the bridge.

`pr95-copy-map.json` has no checker. Its `rule`, `term` and `openDecision` values must resolve in
`medaris-unified/rules.md` and `content/vocabulary.json`.

## What this does not cover

- Names that appear only in the MDRS-127 project's own additions (its Eklemeler card): they were
  not read. Add one with the same fields as its neighbours and run `check-map.mjs` again.
- Anything automatic. There is no codemod; `check-port.mjs` reads tags with a regular expression
  and is a checklist, not a gate.
- #95's `tokens.json`, Tailwind preset and build tooling: dropped, not ported. The unified CSS is
  the only source.
- App code. Nothing in `apps/` or `libs/` reads these files; a code bridge to the unified tokens
  is MDRS-73.
- Copy the copy map does not list. `medaris-unified/content/vocabulary.json` (its `forbid`
  entries) and `content/status-map.json` are the reference, and the owner's copy decides every
  row.
