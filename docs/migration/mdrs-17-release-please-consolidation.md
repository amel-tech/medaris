# MDRS-17 — Release-please consolidation record

**Status:** executed
**Date:** 2026-08-14
**Author:** Enes Yasin Gedik
**Issue:** [MDRS-17](https://linear.app/amel-tech/issue/MDRS-17)
**Normative source:** [ADR-001](../adr/001-monorepo-merge-and-layout.md) §D3 (the seven apps), §D6 (package naming), §D10 (release & commit continuity)

Both source repos arrived with their own `release-please-config.json`,
`.release-please-manifest.json` and `.github/workflows/release-please.yaml` — six
files staged under `.migration/` by MDRS-9 and owned by this task. This record is
what was authored at the root, what was measured, and the one thing that must
happen before a release can be cut.

---

## 1. What landed

| File | Change |
| -- | -- |
| `release-please-config.json` | **New at root.** 7 components, `$schema` added, `extra-files` dropped. Git records it as a rename of the frontend config (5 of its 7 components survive unchanged). |
| `.release-please-manifest.json` | **New at root.** Explicit union of both manifests, 7 entries. |
| `.github/workflows/release-please.yaml` | **New at root.** Replaces two inherited workflows that differed only in their token secret. |
| `tools/ci/assert-release-config.mjs` | **New.** 78 assertions over the release identity chain; wired into `.github/workflows/ci.yaml` and `pnpm assert:release-config`. |
| `.migration/` | **Deleted** — all 6 remaining files consolidated. The directory is gone. |
| `CLAUDE.md` | The "never modify `.migration/`" rule is replaced by a Releases section; the directory no longer exists. |

### The seven components

Component names did not collide between the two repos, as MDRS-17 hoped. The
merged config is the union with three deliberate edits:

1. **`$schema` added** (MDRS-17 AC5). The backend config lacked it. Checked
   against the published schema: its top level is `additionalProperties: false`
   but `properties.packages` is literally `true`, so the per-package
   `component` / `package-name` / `path` keys — none of which the schema
   declares — are not schema violations. Adding `$schema` therefore introduces
   no editor warnings.
2. **`extra-files` dropped**, not repointed. This deviates from MDRS-17's AC4
   ("`extra-files` globs updated to the new layout") and follows ADR-001 §D10,
   which supersedes it: `extra-files` is a **version-string replacement**
   feature, not change detection, so backend's `["libs/**"]` and frontend's
   `["shared/**"]` never did what either repo believed. Repointing a glob that
   was doing nothing would have carried a misconception forward. `shared/` does
   not exist in this repo either way (MDRS-10 moved it to `libs/`), so the
   frontend glob matched nothing at all.
   **Consequence, per §D10:** a lib-only commit no longer implicitly releases an
   app. A lib fix that should ship an app needs a commit scoped to that app.
3. **`package-name` collapsed onto the component name.** It was already equal to
   the component for 6 of 7; only keycloak-theme differed, carrying the
   pre-merge brand name `madrasah-keycloak-theme`. ADR-001 §D3 purges that name
   and notes its component/tag was already decoupled from it, so the rename is
   release-safe. One list now instead of two.

`pull-request-title-pattern` and `pull-request-header` are preserved verbatim per
MDRS-14's note: release-please's unconfigured default title (`chore(main):
release …`) fails the repo's `scope-enum`, which would block every release PR.
Section 4 verifies this against the tool's real output rather than by reasoning.

### The workflow's token

Neither inherited secret (`MADRASAH_BACKEND_PAT`, `MADRASAH_FRONTEND_PAT`) exists
here — measured: `repos/amel-tech/medaris/actions/secrets` returns
`total_count: 0`, and the only visible org secret is `COOLIFY_DEPLOY_TOKEN`. The
workflow therefore names a new `RELEASE_PLEASE_TOKEN` and **fails closed** with an
explicit error step when it is absent.

That guard is deliberate rather than a fallback to `GITHUB_TOKEN`. A release
created with the default token does not emit the `release` event, and all 7
deploy workflows trigger on `release: created`. Falling back would have produced
the worst failure shape available: release-please appears to work, tags and
releases appear, and nothing ever deploys.

## 2. Versions — verified three ways

MDRS-17 requires every manifest version to be checked against the last **actual**
release. Three independent sources agree on all 7, which is why the table below
is stated as verified rather than copied:

| Component | Manifest | Highest tag in the source repo | `package.json` | Newest `CHANGELOG.md` heading |
| -- | -- | -- | -- | -- |
| `tedrisat` | 0.1.5 | `tedrisat-v0.1.5` | 0.1.5 | 0.1.5 |
| `teskilat` | 0.1.1 | `teskilat-v0.1.1` | 0.1.1 | 0.1.1 |
| `tedris-web` | 1.9.0 | `tedris-web-v1.9.0` | 1.9.0 | 1.9.0 |
| `nizam-web` | 0.1.12 | `nizam-web-v0.1.12` | 0.1.12 | 0.1.12 |
| `nazir-web` | 0.1.6 | `nazir-web-v0.1.6` | 0.1.6 | 0.1.6 |
| `landing-web` | 1.2.0 | `landing-web-v1.2.0` | 1.2.0 | 1.2.0 |
| `keycloak-theme` | 1.4.0 | `keycloak-theme-v1.4.0` | 1.4.0 | 1.4.0 |

The tag column comes from the GitHub API on the two still-existing source repos:

```sh
gh api --paginate repos/amel-tech/madrasah-backend/tags  --jq '.[].name'   # 6 tags
gh api --paginate repos/amel-tech/madrasah-frontend/tags --jq '.[].name'   # 37 tags
```

**6 + 37 = 43**, matching the 43 tags MDRS-9 recorded as carried through the
merge — an independent confirmation of that record's count.

## 3. Tag namespaces — the collision that isn't, and the problem that is

**AC3, measured.** The two tag namespaces are disjoint. Every one of the 43 tags
is `<component>-v<semver>`, and no component name is a prefix of another, so no
tag can shadow another's. The near miss is worth naming: `tedrisat` and
`tedris-web` share the string `tedris`, but the deploy workflows match on
`<component>-`, and `tedrisat-` and `tedris-web-` diverge before that separator.
`assert-release-config.mjs` encodes this as a standing assertion so a future
component name cannot reintroduce the hazard.

**The actual problem is the opposite one: `amel-tech/medaris` has no tags at all.**

```sh
git tag --list | wc -l                                  # 0
gh api repos/amel-tech/medaris/tags --jq 'length'        # 0
gh release list --repo amel-tech/medaris                 # empty
```

MDRS-9 §7 step 2 records this as a required post-merge action needing push rights
("**Push the tags** — tags never travel through a pull request", 43 tags from the
`Argedik/medaris` fork). **It was never executed.** MDRS-9's premise still holds —
the merge preserved every SHA, so the tags are not orphaned and remain pushable —
but until someone pushes them, release-please has no release anchor. Section 4
measures exactly what that costs.

This record does not fix it: pushing tags is outside a pull request's reach, and
this task deliberately created none.

## 4. The dry-run — what was actually verified

ADR-001 §D10 requires a dry run before the first real release. It was run against
this branch, so the config under test is the one in this PR:

```sh
pnpm dlx release-please@17 release-pr \
  --repo-url=amel-tech/medaris \
  --target-branch=argedikas/mdrs-17-single-release-please-config \
  --config-file=release-please-config.json \
  --manifest-file=.release-please-manifest.json \
  --dry-run --token=<gh auth token>
```

Exit 0. It created nothing — re-checked afterwards: 0 tags, 0 releases, and no
release pull request (the highest PR in the repo was unrelated).

**Verified by this run:**

- The config parses and all 7 components resolve: `updates: 7`, seven proposed
  release PRs, one per component (`separate-pull-requests` working).
- The manifest is what saves the versions. Verbatim, for each of the 7:
  `No latest release found for path: apps/tedrisat, component: tedrisat, but a
  previous version (0.1.5) was specified in the manifest.` Without the explicit
  bootstrap ADR-001 §D10 mandates, every component would have restarted its
  version line.
- The tag format matches the deploy workflows. release-please logs
  `looking for tagName: tedrisat-v0.1.5`, `nizam-web-v0.1.12`, … — exactly the
  `<component>-v<version>` shape the 7 deploy workflows guard on with
  `startsWith(github.event.release.tag_name, '<component>-')`.
- **AC7 end-to-end.** All 7 titles release-please actually generated were piped
  through `pnpm exec commitlint`: 7 pass, 0 fail. This is the acceptance
  criterion about component names matching `scope-enum`, checked against the
  tool's output rather than by reading the enum.

**The cost of the missing tags, measured.** With no release anchor, release-please
falls back to scanning the whole merged history, so the first run would propose:

| Component | From | To | Changelog entries it would write |
| -- | -- | -- | -- |
| `tedrisat` | 0.1.5 | **0.2.0** | 67 |
| `teskilat` | 0.1.1 | **0.2.0** | 11 |
| `tedris-web` | 1.9.0 | **2.0.0** | 72 |
| `nizam-web` | 0.1.12 | **0.2.0** | 68 |
| `nazir-web` | 0.1.6 | **0.2.0** | 18 |
| `landing-web` | 1.2.0 | **2.0.0** | 25 |
| `keycloak-theme` | 1.4.0 | **2.0.0** | 16 |

277 changelog entries in total, nearly all of them already present in the
`CHANGELOG.md` files, and three spurious **major** bumps. The majors are not
noise from the app's own work — they come from repo-wide migration commits that
touched every app's `package.json` and carried `BREAKING CHANGE` footers (the
`shared/*` → `libs/*` merge, MDRS-10's pnpm conversion, the `check-types` →
`typecheck` rename). release-please attributes a commit by the paths it touched,
so those legitimately land in all 7. The three components already at ≥ 1.0 take a
full major; the four pre-1.0 ones absorb it as a minor because
`bump-minor-pre-major: true`. The compare links in those changelogs would also
point at tags that do not exist in this repo.

**Do not merge a release PR from that first run.** Push the 43 tags first
(§3), then re-run the dry run: with anchors present, each component's diff starts
at its own last release.

## 5. Gate

Run on this branch, after `cp apps/<app>/.env.example apps/<app>/.env` for the
four Next apps:

| Command | Result |
| -- | -- |
| `nx run-many -t typecheck` | Successfully ran target for **16 projects** and 2 tasks they depend on |
| `nx run-many -t test` | Successfully ran target for **3 projects** — tedrisat 8 suites / 89 tests, teskilat 2 suites / 2 tests, `tedris-web` is an `echo` stub |
| `nx run-many -t lint` | Successfully ran target for **16 projects** |
| `nx run-many -t module-boundaries` | Successfully ran target for **16 projects** |
| `nx run-many -t build` | Successfully ran target for **8 projects** |
| `node tools/ci/biome-ratchet.mjs` | 529 files, errors 0 / warnings 94 / infos 27 — every count equal to its baseline, none raised |
| `node tools/ci/assert-release-config.mjs` | 78 assertions, all pass |

`test` totals **91 tests across 10 suites**. Noted rather than corrected:
`CLAUDE.md`'s gate section documents "106 tests / 11 suites", which does not match
what this branch measures. The difference is not caused by anything here — this
PR adds no Nx-target tests — and other pull requests are in flight that do add
suites, so reconciling that number is left alone rather than edited into
agreement.

The new assertion script was also negative-tested, so the gate is not vacuous.
Injecting a wrong manifest version, a deleted manifest entry, a removed
`$schema`, a re-added `extra-files` glob, a renamed component and a default
`chore(main)` title pattern each produced a non-zero exit naming the specific
break; the file was restored afterwards and re-verified green.

## 6. Not verified

- **No real release was cut.** Everything in §4 is `--dry-run`. A release PR
  opening for real, a tag being pushed, a GitHub release firing the deploy
  workflows — none of that is exercised. MDRS-17's AC6 ("a test release PR opens
  correctly for one backend and one frontend component") is verified only to the
  extent a dry run can: the PRs were composed for all 7 components, but no PR
  was created.
- **`RELEASE_PLEASE_TOKEN` does not exist yet**, so the workflow's happy path has
  never run. What is verified is that the repo currently has zero secrets; the
  guard step's behaviour when the secret is *present* is untested.
- **The tag-prefix → deploy handoff is asserted, not observed.** The script
  proves each component's tag prefix appears in a deploy workflow's guard. Nobody
  has watched a release actually trigger a deploy in this repo.
- Whether pushing the 43 tags is sufficient on its own, or whether GitHub
  *release* objects are also needed for release-please to find an anchor, was
  not determined. The dry-run log shows it consulting both
  (`No latest release found …`, `No latest release pull request found.`).

## 7. Follow-ups

| Owner | Item |
| -- | -- |
| **release owner / push rights** | **Blocking the first release.** Push the 43 preserved tags (MDRS-9 §7 step 2), then re-run the §4 dry run and confirm each component diffs from its own last release instead of from the beginning of history. |
| **repo admin** | Create `RELEASE_PLEASE_TOKEN` (a PAT with `contents: write` + `pull-requests: write`). Until then the workflow fails closed by design. Note the 7 deploy workflows' `*_COOLIFY_WEBHOOK` secrets are also absent — the repo has none. |
| **MDRS-21 or release owner** | Decide the `extra-files` replacement policy now that a lib-only commit cannot implicitly release an app (ADR-001 §D10 escalation, unchanged by this task). |
| unassigned | Reconcile `CLAUDE.md`'s documented test totals with what the gate measures (§5). |
| unassigned | `.github/workflows/release-please.yaml` pins `googleapis/release-please-action@v4.3.0` by tag, as ADR-001 §D10 specifies. MDRS-15 left first-party and deploy-workflow refs on tags too; pinning all of them to commit SHAs is still open. |

## 8. A note for whoever adds the eighth component

ADR-001 §D10 lists the procedure: a `pnpm-workspace.yaml` line, a release-please
component, a manifest entry, and a commitlint scope, in one PR. As of this record
there is a fifth step — `LOCKED_COMPONENTS` in
`tools/ci/assert-release-config.mjs`. The list is spelled out there rather than
derived from the config on purpose: a gate that reads its expectations out of the
file it is testing cannot detect a component being added, removed or renamed.
The assertion is meant to make you edit it.
