# Contributing to Medaris

> **Scope of this document.** It covers **commit conventions** (MDRS-14) and the
> **project layers and tags** mirror of ADR-001 §D5 (MDRS-13). One later task
> extends it in place, at the marked anchor near the bottom: **MDRS-18** adds the
> remaining module-boundary review rules and the "how to add a lib" procedure.
> Do not duplicate those sections here — fill in the anchor.

## Commit messages

Every commit must be a [Conventional Commit](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>
```

This is **enforced**, not advisory. A `commit-msg` hook runs
[commitlint](https://commitlint.js.org) against `commitlint.config.mjs` and
rejects the commit if the message does not parse.

The scope is what makes this more than style policing. This one repo publishes
**7 releasable components**, and release-please assigns each commit to a
component by the **paths it touches**, then writes the changelog entry using the
commit's type and scope. So a wrong scope will not misroute a release, but it
will put a misleading label on a real changelog entry, and it makes "which
component was this for?" unanswerable in `git log`. Keeping the scope list closed
and identical to the component names is what stops those two views from
drifting — and it rules out the free-for-all the pre-merge history had (90+
ad-hoc scopes like `flashcard`, `deck-cards`, `pcgk-lock`).

A useful side effect: release-please's own release PR titles are
`chore(<component>): release <version>`, so they satisfy these rules too.

### Rules

| Rule | Requirement |
| --- | --- |
| `type` | required, lower-case, from the type list below |
| `scope` | **required**, from the scope list below |
| `subject` | required, no trailing `.`, not Start-Case / PascalCase / ALL-CAPS |
| header length | ≤ 100 characters |
| body / footer lines | ≤ 100 characters each |
| blank line before body / footer | warning only — does not block the commit |

Everything above except the last row fails the commit. Merge, revert, fixup and
squash commits are exempt via commitlint's `defaultIgnores`, so `git revert` and
`git commit --fixup` keep working.

### Types

`build` · `chore` · `ci` · `docs` · `feat` · `fix` · `perf` · `refactor` ·
`revert` · `style` · `test`

`feat`, `fix` and anything marked breaking are the types that drive a version
bump. Exactly which types appear in a changelog is release-please's
`changelog-sections` config, which MDRS-17 still owns — do not treat the list
above as a released-vs-hidden split.

### Scopes

**Apps** — the scope is the app's **package / release-component name**, which is
not always its directory name:

| Scope | Directory | Kind |
| --- | --- | --- |
| `tedrisat` | `apps/tedrisat` | NestJS service |
| `teskilat` | `apps/teskilat` | NestJS service |
| `tedris-web` | `apps/tedris` | Next.js app |
| `nizam-web` | `apps/nizam` | Next.js app |
| `nazir-web` | `apps/nazir` | Next.js app |
| `landing-web` | `apps/landing` | Next.js app |
| `keycloak-theme` | `apps/keycloak-theme` | Keycloakify theme |

The `-web` suffix is deliberate: ADR-001 §D6 names app packages
`@medaris/<release-component>` while the directories stay bare. **Follow the
component, not the folder** — release-please cuts releases against the component.

**Libs** — scope is the directory name, matching `@medaris/<dirname>`:

| Scope | Directory |
| --- | --- |
| `common` | `libs/common` |
| `ui` | `libs/ui` |
| `icons` | `libs/icons` |
| `tokens` | `libs/tokens` |
| `hooks` | `libs/hooks` |
| `services` | `libs/services` |
| `i18n` | `libs/i18n` |
| `types` | `libs/types` |
| `utils` | `libs/utils` |

**Cross-cutting** — these release nothing on their own:

| Scope | Use for |
| --- | --- |
| `repo` | workspace wiring: pnpm, Nx, tsconfig, Biome, git hooks |
| `deps` | dependency bumps (the catalog in `pnpm-workspace.yaml`) |
| `ci` | GitHub Actions workflows |
| `docs` | ADRs, migration records, README, this file |

Touching several packages at once? Prefer splitting the commit. If the change is
genuinely indivisible workspace plumbing, use `repo`.

**Adding a scope is never a standalone edit.** Per ADR-001 §D10, a new package
lands as one PR that touches all four of: the `pnpm-workspace.yaml` `packages:`
list, the release-please component config, the release-please manifest, and the
`scope-enum` in `commitlint.config.mjs`. The scope list is also an MDRS-17
acceptance criterion.

### Breaking changes

Append `!` after the scope, and explain the migration in the body:

```
feat(tedrisat)!: require X-Tenant-Id on every enrolment endpoint

Callers without the header now get 400 instead of falling back to the
default tenant.
```

A `BREAKING CHANGE:` footer works too. Either form makes release-please cut a
major for that component.

### Examples

```
feat(nizam-web): add bulk flashcard import from xlsx
fix(common): stop swallowing validation errors in the global filter
refactor(ui)!: drop the deprecated `size="xs"` button variant
chore(deps): bump next to 16.1.6
chore(repo): unify commit hygiene at the root
docs(tedrisat): document the enrolment endpoints
ci(landing-web): add a preview deploy on pull_request
```

`type` and `scope` are separate namespaces that happen to share three names
(`build`, `ci`, `docs`). Scope the *subject matter*, not the kind of change:
`docs(tedrisat)` for docs about tedrisat, `ci(landing-web)` for that app's
workflow. The `ci` and `docs` **scopes** are only for changes with no single
owning package — `ci(ci)` for shared workflow plumbing, `docs(docs)` for content
under `docs/` such as ADRs and migration records. Root-level contributor files
(this one, `README.md`) count as repo plumbing: `docs(repo)`.

Rejected, and why:

```
Fix login bug                 # type-empty, scope-empty, subject-empty
feat: add tenant switcher     # scope-empty
feat(flashcard): ...          # scope-enum — not a package; use `nizam-web`
feat(tedris): ...             # scope-enum — directory name; use `tedris-web`
fix(ui): Broken Tooltip       # subject-case — Start-Case
fix(ui): fix the tooltip.     # subject-full-stop — trailing period
```

## Git hooks

Hooks live in `.husky/` at the **repo root** — one set for the whole workspace.
They are installed by the `prepare` script, so a plain install is all it takes:

```bash
pnpm install
```

| Hook | Runs | Why |
| --- | --- | --- |
| `pre-commit` | `lint-staged` → `biome check --write` | formats and autofixes **only the staged files** |
| `commit-msg` | `commitlint --edit "$1"` | validates the message |

`pre-commit` is intentionally cheap: it never typechecks, builds, or looks at
files you did not stage — in a 16-package workspace that is minutes per commit.
It does still **lint** the staged files, because `biome check` is lint + format
in one. Most diagnostics are autofixed silently, but an error-level one that
Biome cannot safely fix (say `suspicious/noDoubleEquals`) will fail the commit.
Full-repo verification belongs to the gate:

```bash
pnpm nx run-many -t typecheck test build lint module-boundaries
```

Because `lint-staged` autofixes and re-stages, a commit can end up containing
formatting changes you did not type. That is expected.

### Troubleshooting

**Hooks do not run at all.** Check both halves — the setting *and* the directory
it points at:

```bash
git config core.hooksPath   # expect: .husky/_
ls .husky/_/pre-commit      # must exist in THIS working tree
```

If either is missing, run `pnpm install` **here**.

**Run `pnpm install` in every new clone and every new `git worktree`.** The
config value is written to the shared `.git/config`, so a new worktree does
inherit it — but the value is the *relative* path `.husky/_`, which git resolves
against whichever working tree it is running in, and `.husky/_/` is generated by
husky and **git-ignored**. So a fresh worktree has the tracked `.husky/pre-commit`
and `.husky/commit-msg` but no `_/` dispatcher, and git skips both hooks
**silently — no warning, exit 0**. Since nothing lints commit messages in CI yet
either, an unconventional message committed from a fresh worktree is caught by
nothing at all.

**Need to bypass a hook.** Don't. `--no-verify` is prohibited in this repo — fix
the message or the formatting instead. If a hook is genuinely wrong, that is a
bug in `.husky/` worth its own commit.

**Editing a file Biome ignores** (generated clients, i18n locale JSON, lockfiles)
is fine: `lint-staged` passes `--no-errors-on-unmatched`, so an ignored or
unknown file is skipped rather than failing the commit.

### Do not partially stage a file the formatter will reflow

**Stage whole files.** If you stage only some hunks of a file (`git add -p`) and
leave other edits unstaged *in the same region*, the working-tree copy can come
back corrupted — and the commit still succeeds.

This is inherent to running an autofixing formatter from a hook, not a bug in
our setup. `lint-staged` hides your unstaged edits, lets Biome rewrite the file,
then re-applies them as a patch. If Biome reflowed the lines that patch targets
(a one-line arrow function becoming three, say), it re-applies at the wrong
offset. Reproduced here: an unstaged line landed *inside* the body of the
function Biome had just expanded, producing `TS1184` — and `lint-staged` exited
**0**.

If it happens, `git stash list` will be **empty** — the backup `lint-staged`
made is a dangling commit, not a stash entry. Find it with:

```bash
git fsck --no-reflogs --lost-found | grep commit   # look for "WIP on <branch>"
git show <sha>                                     # your pre-hook state
```

Staging whole files avoids the situation entirely: with nothing unstaged to
hide, there is no patch to re-apply.

## Project layers and tags

Every Nx project carries `tags` in its `project.json`. Two axes are **enforced**
by `@nx/enforce-module-boundaries`; the third is documentary. This table is the
one-screen mirror of ADR-001 §D5 — the ADR is normative, `eslint.config.mjs` is
the implementation.

| Project | `scope` | `platform` | `type` |
| -- | -- | -- | -- |
| `tedrisat` | `app` | `node` | `app` |
| `teskilat` | `app` | `node` | `app` |
| `tedris-web` | `app` | `web` | `app` |
| `nizam-web` | `app` | `web` | `app` |
| `nazir-web` | `app` | `web` | `app` |
| `landing-web` | `app` | `web` | `app` |
| `keycloak-theme` | `app` | `web` | `app` |
| `common` | `server` | `node` | `infra` |
| `ui` | `ui` | `web` | `ui` |
| `icons` | `ui` | `web` | `ui` |
| `tokens` | `ui` | `web` | `ui` |
| `hooks` | `ui` | `web` | `util` |
| `services` | `web` | `web` | `data-access` |
| `i18n` | `shared` | *(none)* | `i18n` |
| `types` | `shared` | *(none)* | `types` |
| `utils` | `shared` | *(none)* | `util` |

`scope:shared` libraries are deliberately **platform-neutral** — they carry no
`platform:*` tag, which is what lets both the Nest apps and the browser bundles
import them. Do not add one.

Allowed dependency directions:

| sourceTag | may depend on |
| -- | -- |
| `scope:shared` | `scope:shared` |
| `scope:ui` | `scope:ui`, `scope:shared` |
| `scope:web` | `scope:web`, `scope:ui`, `scope:shared` |
| `scope:server` | `scope:server`, `scope:shared` |
| `scope:app` (fallback) | `scope:ui`, `scope:web`, `scope:server`, `scope:shared` |
| `scope:app` + `platform:web` | `scope:ui`, `scope:web`, `scope:shared` |
| `scope:app` + `platform:node` | `scope:server`, `scope:shared` |
| `platform:web` | **not** `platform:node` |
| `platform:node` | **not** `platform:web` |

All matching constraints apply cumulatively: `tedris-web` is checked against the
generic `scope:app` rule, the `scope:app` + `platform:web` narrowing, *and* the
`platform:web` exclusion. `scope:app` appears in no allowed list, so no project
may depend on an app — with one measured caveat, see
[What is enforced today](#what-is-enforced-today). `type:*` carries no constraint today; a
`type:testing → everything-below-app` rule is pre-approved for when a real
testing library or `apps/e2e` appears.

**A new project must get its tags in the same pull request that creates it.**
`depConstraints` cannot express "this tag is mandatory" — an untagged project
matches no constraint and is silently unconstrained, and an app tagged only
`scope:app` loses its platform narrowing. Reviewers check this by hand.

## Module boundaries

ESLint exists in this repo for exactly one purpose: running
`@nx/enforce-module-boundaries`. All formatting and linting is Biome's job. Do
not add style rules to `eslint.config.mjs` — they belong in `biome.json` or
nowhere.

Run the check on its own:

```bash
pnpm module-boundaries          # nx run-many -t module-boundaries
```

It also runs in CI as part of `nx affected`.

### What is enforced today

The full `scope:*` / `platform:*` taxonomy from the section above, with
`allow: []` — there are no exceptions. `enforceBuildableLibDependency: true` also
stops a buildable library (`common`, `tokens`) from importing a source-only one;
both currently have zero internal dependencies, so it is inert but correct.

A violating import fails the check with a message naming the tags, for example:

```
apps/tedris/lib/boundary-probe.ts
  2:1  error  A project tagged with "scope:app" and "platform:web" can only
              depend on libs tagged with "scope:ui", "scope:web", "scope:shared"
              @nx/enforce-module-boundaries
```

Three things the linter cannot see. Treat them as review rules:

- **CSS `@import` edges.** `ui → tokens` is a CSS import; ESLint never parses it.
  The declared `workspace:*` dependency plus pnpm's strict `node_modules` is the
  only thing keeping it honest.
- **`@medaris/<app>` package specifiers.** Apps declare no `main`/`exports`, so
  Nx resolves such a specifier to no project and the rule stays silent. The
  import cannot compile either — but do not rely on the linter to say so. The
  relative form (`../../tedris/lib/...`) *is* caught, with a dedicated
  "Projects cannot be imported by a relative or absolute path" error.
- **Missing tags.** See the mandatory-tags note in the section above.

## Adding a library

Libraries live in `libs/<name>` and resolve as `@medaris/<name>` through the
pnpm workspace. There are **no `paths` aliases** in `tsconfig.base.json`;
resolution is entirely workspace-link based, so a correct `package.json` is what
makes the import work.

1. **Create the package.** `libs/<name>/package.json`, modelled on an existing
   leaf library such as `libs/utils`:

   ```jsonc
   {
     "name": "@medaris/<name>",
     "version": "0.0.0",
     "main": "./src/index.ts",
     "types": "./src/index.ts",
     "module": "./dist/index.js",
     "type": "module",
     "sideEffects": false,
     "private": true,
     "files": ["dist/**"],
     "scripts": { "typecheck": "tsc -b tsconfig.json" },
     "devDependencies": { "typescript": "catalog:" }
   }
   ```

   Consumers import the **source** (`main`/`types` point at `src/index.ts`), so
   a plain library needs no build step. Add a `build` script only if something
   genuinely consumes `dist/` — `libs/common` does, because the Nest apps fail
   at boot with `TS2307` without it.

2. **Add `tsconfig.json`** extending `tsconfig.base.json`, with a `src/index.ts`
   barrel as the single public entry point. Do not let consumers deep-import
   past the barrel.

3. **Pin dependencies through the catalog.** Use `"catalog:"` rather than a
   version range so the workspace keeps one version per dependency. New
   dependencies get added to `pnpm-workspace.yaml`'s catalog first.

4. **Wire the consumer.** Add `"@medaris/<name>": "workspace:*"` to the
   dependent's `package.json`, then `pnpm install`. Nx infers the project graph
   from the workspace — there is no project registry to edit by hand.

5. **Add the scope.** A new library needs its name in the `scope-enum` in
   `commitlint.config.mjs`, or every commit touching it will be rejected. See
   the scope list earlier in this document.

6. **Add `project.json` with `tags`.** Pick one `scope:*`, one `platform:*`
   unless the library is platform-neutral (`scope:shared`), and one descriptive
   `type:*` — see [Project layers and tags](#project-layers-and-tags). This is
   not optional: an untagged project matches no `depConstraints` entry and is
   silently exempt from every boundary rule.

   ```jsonc
   {
     "$schema": "../../node_modules/nx/schemas/project-schema.json",
     "name": "<name>",
     "tags": ["scope:shared", "type:util"],
     "targets": { "lint": {} }
   }
   ```

7. **Verify before opening a pull request.**

   ```bash
   pnpm nx run-many -t typecheck test build lint module-boundaries --skip-nx-cache
   pnpm graph        # confirm the new edge is the one you intended
   ```
