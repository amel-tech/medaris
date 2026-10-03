# MDRS-87 — Production channel: `stable` on release, webhook by event

Stacked on MDRS-86 (development on `latest`). This record covers only the
repository half; the Coolify `production` applications and the first release
are tracked on the issue and are not done as of this writing.

## What changed

| File | Change |
| -- | -- |
| `.github/workflows/{tedrisat-api,teskilat-api,tedris-web,nizam-web,nazir-web,landing-web}.yaml` | `metadata-action` gains `type=raw,value=stable,enable=${{ github.event_name == 'release' && github.event.release.prerelease == false }}`; the *Deploy to Coolify* step picks `<APP>_PROD_COOLIFY_WEBHOOK` under that same condition and the existing `<APP>_COOLIFY_WEBHOOK` otherwise, each checked on its own so an unset secret fails naming itself and never falls back to the other channel |
| `docs/runbooks/deploy-*.md` (6) | §1 tag table and rule block carry `stable`; §2 describes the two channels alongside the `cd-development.yaml` paths MDRS-86 added; §3 Path B names `stable` for production; *Known blockers* gains the unset production webhook |

`keycloak-theme-app.yaml` is untouched: it deploys to the single shared
Keycloak in the *Amel-Tech Auth* project, which has no environment split.

## The model

| Channel | Coolify environment | Pulls | Moves when |
| -- | -- | -- | -- |
| development | `development` | `latest` | every workflow run on `main` |
| production | `production` | `stable` | only on a full GitHub release |
| rollback | either | `<semver>` / `sha-<short>` | never |

No `dev` tag is reintroduced: `latest` already plays that role (the old
repositories' `ci-dev.yaml` pushed `<app>-dev`; see the MDRS-86 record for why
that disappeared). `latest` also moves on a release; the release commit is the
head of `main`, so development receives the same build.

**Why `prerelease == false` and not a different trigger.** The six workflows
run on `release: created`, which GitHub fires for a pre-release as well —
only drafts are excluded. Without a guard, a hand-cut `…-v2.0.0-rc.1` would
move `stable` and redeploy production with a release candidate, which is the
one thing this channel exists to prevent. The guard is on the two places that
mean *production* — the `stable` tag rule and the webhook choice — rather than
on the trigger itself, so the development path is untouched: a pre-release
still builds, still pushes `<semver>-rc.1` + `latest` + `sha-…`, and still
deploys to `development`, which is where a release candidate belongs.
Switching the trigger to `release: released` would also work for production,
but it would stop a pre-release deploying anywhere at all and it would change
a trigger the six runbooks and the MDRS-16 record describe.

## Verified

Commands and their output, run on this branch after `main` was merged into it
(2026-09-22).

**The six workflow files parse as YAML.**

```sh
for f in .github/workflows/{tedrisat-api,teskilat-api,tedris-web,nizam-web,nazir-web,landing-web}.yaml; do
  python3 -c "import sys,yaml;yaml.safe_load(open(sys.argv[1]));print('ok', sys.argv[1])" "$f"
done
```

```
ok .github/workflows/tedrisat-api.yaml
ok .github/workflows/teskilat-api.yaml
ok .github/workflows/tedris-web.yaml
ok .github/workflows/nizam-web.yaml
ok .github/workflows/nazir-web.yaml
ok .github/workflows/landing-web.yaml
```

**The deploy step's script is valid bash and picks the channel by event.** The
`run:` body of *Deploy to Coolify* was extracted from `tedrisat-api.yaml` with
`yaml.safe_load` and run directly. `bash -n` exits 0. Each branch is checked
with the *other* channel's secret present, which is what proves there is no
fallback:

```sh
IS_PRODUCTION=true  DEV_WEBHOOK=https://example.invalid/dev PROD_WEBHOOK= COOLIFY_TOKEN=x bash deploy-step.sh; echo "exit $?"
IS_PRODUCTION=false DEV_WEBHOOK= PROD_WEBHOOK=https://example.invalid/prod COOLIFY_TOKEN=x bash deploy-step.sh; echo "exit $?"
```

```
::error::TEDRISAT_SERVICE_PROD_COOLIFY_WEBHOOK is not set — the image was pushed to GHCR but nothing was redeployed to production.
exit 1
::error::TEDRISAT_SERVICE_COOLIFY_WEBHOOK is not set — the image was pushed to GHCR but nothing was redeployed to development.
exit 1
```

The other five workflows carry the same script with their own two secret names
substituted; only tedrisat's was executed.

## Not verified

- No release has been created from `medaris`, so `stable` has never been
  pushed and the production branch of the deploy step has never run for real.
  The issue's first acceptance criterion is exactly that measurement.
- No `<APP>_PROD_COOLIFY_WEBHOOK` secret is set and the Coolify `production`
  applications do not exist yet, so the first release will push the four image
  tags and then fail on the webhook step. Each runbook's *Known blockers*
  section says so under its own secret name.
- ~~The first release also needs the 43 historical tags pushed first~~ — done
  on 2026-09-22, after this branch was written (MDRS-17 §3–§4, MDRS-86 §4
  step 4). What was measured before pushing them:

  ```sh
  { gh api --paginate repos/amel-tech/madrasah-frontend/tags --jq '.[] | "\(.commit.sha) \(.name)"'
    gh api --paginate repos/amel-tech/madrasah-backend/tags  --jq '.[] | "\(.commit.sha) \(.name)"'; } > tags.txt
  wc -l < tags.txt
  while read sha name; do
    git merge-base --is-ancestor "$sha" origin/main || echo "unreachable: $name"
  done < tags.txt
  ```

  `43` tag lines, and every one of the 43 commits is an ancestor of
  `origin/main` — nothing printed `unreachable`. After the push,
  `gh api --paginate repos/amel-tech/medaris/tags --jq '.[].name' | wc -l` →
  `43`, and `gh api repos/amel-tech/medaris/releases --jq 'length'` → `0`: the
  anchor exists, the first release does not. release-please was re-run by
  `workflow_dispatch` (run `35684036232`) and regenerated all seven PRs. What
  the seven now write, counted per PR — added changelog entries, and how many
  of them already appear in that component's `CHANGELOG.md` on `main`:

  ```sh
  while read -r pr path; do
    added=$(gh pr diff "$pr" | grep -c '^+\* ')
    d=0
    while IFS= read -r line; do
      text=${line%%(\[*}; text=${text#+}
      git show "origin/main:$path/CHANGELOG.md" | grep -qF -- "$text" && d=$((d+1))
    done < <(gh pr diff "$pr" | grep '^+\* ')
    printf '#%s %-20s entries %3d  already present %3d\n' "$pr" "$path" "$added" "$d"
  done <<'ROWS'
  83 apps/tedrisat
  84 apps/nazir
  85 apps/landing
  86 apps/teskilat
  87 apps/tedris
  88 apps/nizam
  89 apps/keycloak-theme
  ROWS
  ```

  ```
  #83 apps/tedrisat           entries  22  already present   0
  #84 apps/nazir              entries   7  already present   0
  #85 apps/landing            entries   7  already present   0
  #86 apps/teskilat           entries  12  already present   0
  #87 apps/tedris             entries  12  already present   0
  #88 apps/nizam              entries  12  already present   0
  #89 apps/keycloak-theme     entries   7  already present   0
  ```

  **79 entries, 0 of them duplicates.** The same counting logic, run on the
  *anchorless* PRs earlier on 2026-09-22 before the tags were pushed, gave 276
  entries of which 178 were already present (per PR, entries/present: 77/52,
  17/10, 25/18, 12/0, 66/45, 67/48, 12/5). release-please has since overwritten
  those seven branches, so that pair of numbers cannot be re-derived from the
  repository and is recorded here as a one-time measurement — with the 276
  landing one short of the 277 MDRS-17 §4 predicted independently, from the
  dry run.
