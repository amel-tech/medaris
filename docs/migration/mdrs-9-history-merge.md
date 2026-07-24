# MDRS-9 — History merge record

**Status:** executed
**Date:** 2026-07-24
**Author:** Enes Yasin Gedik
**Issue:** [MDRS-9](https://linear.app/amel-tech/issue/MDRS-9)
**Normative source:** [ADR-001](../adr/001-monorepo-merge-and-layout.md) §D1 (layout), §D2 (path rewrite + collision runbook), §D4 (the twelve libs), §D10 (release continuity)

This is the audit record for the one commit range that can never be re-derived. Everything
here is verifiable from the merged history with the commands shown.

---

## 1. Approach — and why not `filter-repo`

MDRS-9's text suggests `git subtree add` or `git read-tree` + `filter-repo` for the path
rewriting. Neither was used. Instead:

1. `git merge --allow-unrelated-histories` per source repo, into `medaris`.
2. `shared/* → libs/*` as an ordinary **tracked rename commit** after the merge.

**Why:** `filter-repo` rewrites every commit to change paths, which changes every SHA. The
rename-after-merge form reaches the same tree while **keeping every original SHA**. Three
things follow, all of them strictly better:

- **All 43 tags stay anchored** to real ancestors of `main` — no tag migration, no re-pointing.
- Existing `CHANGELOG.md` entries, PR references and commit links in both repos still resolve.
- `git log --follow` / `git blame` cross the rename via git's own rename detection, which is
  what `--follow` is for. All 192 moved files recorded as `R100` (exact renames).

**Consequence for ADR §D10.** Its premise — *"the history rewrite changes every SHA and
orphans old tag anchors, so versions must not be re-derived"* — **does not hold for this
merge**. The explicit `.release-please-manifest.json` bootstrap it mandates is still the right
call (it is cheap, and it pins the D3 versions deterministically), but MDRS-17 should know the
reason changed: the tags are *not* orphaned. Verify before relying on either statement:

```sh
for t in $(git tag); do git merge-base --is-ancestor "$t" HEAD || echo "ORPHAN $t"; done
```

## 2. Path rewrites (ADR §D2)

| Source | Rule | Result |
| -- | -- | -- |
| madrasah-backend `apps/*` | identity | `apps/tedrisat`, `apps/teskilat` |
| madrasah-backend `libs/common` | identity | `libs/common` |
| madrasah-frontend `apps/*` | identity | `apps/{tedris,nizam,nazir,landing,keycloak-theme}` |
| madrasah-frontend `shared/*` | **→ `libs/*`** | 11 dirs, 192 files, all `R100` |

`apps/` holds exactly the seven apps of §D3. `libs/` holds exactly the twelve libs of §D4.
`mocks`, `eslint-config` and `typescript-config` moved with the rest **purely so their history
stays reachable after MDRS-10 deletes them** (§D2). They are never registered in
`pnpm-workspace.yaml` and never become Nx projects.

## 3. Collision resolutions

ADR §D2 resolves colliding **root config** as *"take neither — the new root is authored fresh
by MDRS-10/12/15/17"*. MDRS-9's own AC additionally requires that **no colliding path be
silently dropped**, and sanctions keeping both *"under temporary names where needed"*.

Both are satisfied by **staging, not deleting**: root is cleared for fresh authoring, while
each superseded file stays in tree under `.migration/<side>/<original-path>`. This also keeps
MDRS-10 self-contained — it finds **both** `package-lock.json` files in tree to seed
`pnpm import` from, instead of reaching outside the repo for them.

The exact collision set was computed, not assumed:

```sh
comm -12 <(git ls-files) ...   # 17 exact FE∩BE paths; 2 more against medaris
```

### 3a. Tracked in both source repos (17 paths)

| Path | Resolution |
| -- | -- |
| `package.json` | both staged → `.migration/{backend,frontend}/` · root re-authored by **MDRS-10** |
| `package-lock.json` | both staged · **MDRS-10** seeds `pnpm import` from them, then deletes |
| `tsconfig.json` | both staged · root re-authored by **MDRS-10** (+ `tsconfig.base.json`) |
| `turbo.json` | both staged · retired by **MDRS-11** (Nx) |
| `commitlint.config.js` | both staged · root `commitlint.config.mjs` by **MDRS-17** |
| `release-please-config.json` | both staged · 7-component config by **MDRS-17** |
| `.release-please-manifest.json` | both staged · explicit union bootstrap by **MDRS-17** (§D10) |
| `.husky/commit-msg` | both staged · re-authored by **MDRS-12** |
| `.husky/pre-commit` | both staged · lint-staged + biome by **MDRS-12** |
| `.husky/pre-push` | both staged · backend's heavy build+test hook is deliberately dropped (§D8) |
| `.github/workflows/ci-dev.yaml` | both staged · re-authored by **MDRS-15** |
| `.github/workflows/codeql.yaml` | both staged · re-authored by **MDRS-15** |
| `.github/workflows/pull-request.yaml` | both staged · re-authored by **MDRS-15** |
| `.github/workflows/release-please.yaml` | both staged · re-authored by **MDRS-17** |
| `.gitignore` | **mechanical union** — see 3c |
| `README.md` | root keeps **medaris's**; both source copies staged |
| `.github/pull_request_template.md` | **not staged** — both copies byte-identical (`sha1 501184f0`), re-verified at merge time per §D2; root keeps the single shared version |

### 3b. Tracked in medaris and at least one source (2 paths)

`.gitignore` and `README.md` — same resolutions as above. `.mcp.json` is listed as a collision
by both MDRS-9 and §D2, but is **untracked in both source repos** (verified: `git ls-files
'*mcp*'` is empty in each), so no collision arose and medaris's copy survives untouched — same
situation §D2 already noted for `.claude/`.

### 3c. `.gitignore` union

Root `.gitignore` = medaris's 2 lines + 12 backend-unique lines + 103 frontend lines, deduped,
each block under a provenance comment. 10 frontend lines were already present from the backend
block and skipped. Nothing dropped, so the originals are not staged. Where the two disagreed on
form, the **more specific** rule won: the frontend's selective `.vscode/*` + `!settings.json`
negations are kept over the backend's blanket `.vscode/`, because the frontend actually tracks
`.vscode/{extensions,settings,tasks}.json`.

### 3d. Surviving `.github/workflows/`

Exactly the **7 deploy workflows** of §D1 (`tedrisat-api`, `teskilat-api`, `tedris-web`,
`nizam-web`, `nazir-web`, `landing-web`, `keycloak-theme-app`). All are
`workflow_dispatch`/`workflow_call` only, so **nothing fires on this branch** — which matters,
because the four staged-out workflows were precisely the `push`/`pull_request`-triggered ones,
and the root has no `package.json` for them to install from.

## 4. Reconciliation

| Check | Expected | Actual |
| -- | -- | -- |
| medaris commits present | 7 | **7** |
| madrasah-backend commits present | 297 | **297** |
| madrasah-frontend commits present | 577 | **577** |
| total on branch | 881 + 5 merge/rewrite commits | **886** |
| tags carried | 43 | **43**, all ancestors of `HEAD` |
| tracked files | 778 − 2 (`.gitignore` union) − 1 (shared template) | **775** |

```sh
git rev-list HEAD | sort > all
comm -12 all <(git rev-list <source>/main | sort) | wc -l   # per source repo
```

`--follow` verified on both sides, reaching each repo's initial commit:

```sh
git log --follow -- libs/ui/src/components/alert-dialog.tsx   # → shared/ui/... , 420e4ad, Samet, 2025-10-24
git log --follow -- libs/utils/src/index.ts                   # → dbd79e5, frontend init, 2025-07-19
git log --follow -- apps/tedrisat/src/app.controller.ts       # → 33d294a, backend init, 2025-07-17
git blame libs/ui/src/components/alert-dialog.tsx             # shows the pre-rename path + original author
```

medaris's canonical `docs/PRD.md`, `docs/ecosystem-boundaries.md` and `docs/adr/*` are
byte-identical to `origin/main` (sha-compared, not eyeballed). The backend's tracked
`docs/SECURITY_AUDIT.md` rode along conflict-free, as §D2 predicted.

## 5. Deliberately NOT done here

Per §D2 and MDRS-9's *"the repo is not expected to build yet"*:

- No `@madrasah/*` → `@medaris/*` rename — **MDRS-10**. Current scope: **529 occurrences across
  248 files** (excluding `.migration/`; 594/252 including it).
- No config path rewrites. **15 files still reference `shared/`** outside `.migration/`
  (`transpilePackages`, tsconfig references, turbo globs) — **MDRS-10**.
- No root `package.json` / `pnpm-workspace.yaml` / lockfile — **MDRS-10**.
- No lib deletions (`mocks`, `eslint-config`, `typescript-config`) — **MDRS-10**.

## 6. Handoff — items MDRS-10 must pick up

1. **`.husky/post-checkout` is npm-shaped.** Frontend-only, so it never collided and rode along
   to root untouched. It runs `npm install` when `package-lock.json` changes — meaningless once
   both lockfiles are gone. Inert today (no `husky` install wires `core.hooksPath` without a
   root `package.json`), but MDRS-10 must delete or port it.
2. **`.migration/` must be empty and removed by the end of MDRS-12/15/17.** Anything still
   staged after its owning task lands is an unfinished consolidation, not a leftover.
3. Non-colliding root config rode along and still needs an owner: backend's
   `tsconfig.base.json`, `nest-cli.json`, `audit-ci.json`, `.depcheckrc.json`,
   `docker-compose.yml`, `docker/`, `.env.example`, `CHANGELOG.md`; frontend's
   `eslint.config.js`, `.vscode/`. MDRS-9 left them alone on purpose (not collisions), so
   MDRS-10/12 must not assume the root is bare.

## 7. Post-merge steps that need push access to `amel-tech/medaris`

This branch was pushed from a fork (`Argedik/medaris`) — the author has pull-only access. Two
steps therefore cannot be done from the PR and must be run by someone with push rights:

1. **Merge with a real merge commit.** A **squash or rebase merge destroys the entire point of
   this issue** — 881 commits collapse to 1 and every tag anchor is orphaned. Use *Create a
   merge commit*, or push the branch directly.
2. **Push the tags** — tags never travel through a pull request:
   ```sh
   git remote add fork https://github.com/Argedik/medaris.git
   git fetch fork 'refs/tags/*:refs/tags/*'
   git push origin --tags     # 43 tags, all already ancestors of main after the merge
   ```
   Verify after: `git tag | wc -l` → 43, and the orphan check in §1 prints nothing.

## 8. Freeze

MDRS-9's first AC is a freeze window on both source repos, so no commit lands in them after the
merge branch is cut. That is an **org/process action, not a code change** — it is the one AC
this PR cannot satisfy by itself. Merge base as cut:

| Repo | `main` at merge time |
| -- | -- |
| madrasah-backend | `c885f6d` (297 commits) |
| madrasah-frontend | `c0eaf27` (577 commits) |

Anything landing in either repo after those SHAs must be cherry-picked into medaris by hand.

## Related

- [ADR-001](../adr/001-monorepo-merge-and-layout.md) — target layout, path rewrite rules, collision runbook
- [MDRS-8 dependency reconciliation](./mdrs-8-dependency-reconciliation.md) — catalog that MDRS-10 applies to this tree
- MDRS-10 — the pnpm workspace conversion + `@medaris/*` rebrand that runs on top of this merge
