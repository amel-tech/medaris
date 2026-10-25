# Dependency security

How this repo keeps known-vulnerable and freshly-published packages out of
`pnpm-lock.yaml`. Rewritten on 2026-10-25, when the PR gate stopped auditing the
whole tree. The earlier version of this page described npm commands, a
`security-audit.yml` workflow and a `pre-commit-security` hook, none of which
existed in this repo.

## The three parts

| Part | Where | When it says no |
| --- | --- | --- |
| **Security gates** check | `.github/workflows/security.yaml`, job `gates` | A PR or push brings in a high/critical advisory that the base did not have. depcheck runs in the same job. |
| **Dependency audit** issue | `.github/workflows/security.yaml`, job `report` | Never red on findings. Daily at 04:23 UTC it opens, rewrites or closes the one issue labelled `dependency-audit`, and comments when a new advisory appears. |
| **Release-age floor** | `minimumReleaseAge` in `pnpm-workspace.yaml` | pnpm refuses any release younger than 7 days, during resolution and on every install of the lockfile. |

Renovate (`renovate.json`) opens the update PRs. It waits the same 7 days. On
Mondays it opens a lock file maintenance PR that re-resolves every range; that
is the PR that picks up a transitive fix the parent's range already admits.
Majors, plus Biome, `@babel/standalone` and Playwright, wait for a tick on its
Dependency Dashboard issue.

## Policy

`audit-ci.json` holds the thresholds (`high` and `critical`), `skip-dev`
(`false`: dev tooling is audited too) and the dated allowlist.
`tools/ci/dependency-audit.mjs` reads it and rejects any key it does not
implement. audit-ci itself is no longer installed.

## Commands

```bash
pnpm run audit:ci      # would this branch fail Security gates? (against origin/main)
pnpm run audit:report  # the full list, as the issue would show it
pnpm run depcheck      # unused/missing dependencies
```

## When an advisory appears

Nothing goes red. The advisory shows up in the `dependency-audit` issue.

- **Direct dependency:** raise its catalog entry in `pnpm-workspace.yaml`, or
  wait for Renovate.
- **Transitive, and the parent's range admits the fix:** the next lock file
  maintenance PR clears it.
- **Transitive, and the parent pins it exactly:** add a floor under *Security
  floors* in `pnpm-workspace.yaml`, with one line giving the advisory, why only
  an override reaches it, and its removal condition.
- **No fixed release at all:** add it to the `audit-ci.json` allowlist with a
  dated reason. The issue lists allowlist entries that are no longer found.

A fix younger than 7 days that cannot wait goes into `minimumReleaseAgeExclude`
as `name@version`, with the date it turns 7 days old. Delete the line after that
date.
