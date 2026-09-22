# MDRS-87 — Production channel: `stable` on release, webhook by event

Stacked on MDRS-86 (development on `latest`). This record covers only the
repository half; the Coolify `production` applications and the first release
are tracked on the issue and are not done as of this writing.

## What changed

| File | Change |
| -- | -- |
| `.github/workflows/{tedrisat-api,teskilat-api,tedris-web,nizam-web,nazir-web,landing-web}.yaml` | `metadata-action` gains `type=raw,value=stable,enable=${{ github.event_name == 'release' }}`; the *Deploy to Coolify* step picks `<APP>_PROD_COOLIFY_WEBHOOK` on a `release` and the existing `<APP>_COOLIFY_WEBHOOK` otherwise, each checked on its own so an unset secret fails naming itself and never falls back to the other channel |
| `docs/runbooks/deploy-*.md` (6) | §1 tag table and rule block carry `stable`; §2 describes the two channels alongside the `cd-development.yaml` paths MDRS-86 added; §3 Path B names `stable` for production; *Known blockers* gains the unset production webhook |

`keycloak-theme-app.yaml` is untouched: it deploys to the single shared
Keycloak in the *Amel-Tech Auth* project, which has no environment split.

## The model

| Channel | Coolify environment | Pulls | Moves when |
| -- | -- | -- | -- |
| development | `development` | `latest` | every workflow run on `main` |
| production | `production` | `stable` | only on a GitHub release |
| rollback | either | `<semver>` / `sha-<short>` | never |

No `dev` tag is reintroduced: `latest` already plays that role (the old
repositories' `ci-dev.yaml` pushed `<app>-dev`; see the MDRS-86 record for why
that disappeared). `latest` also moves on a release; the release commit is the
head of `main`, so development receives the same build.

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
IS_RELEASE=true  DEV_WEBHOOK=https://example.invalid/dev PROD_WEBHOOK= COOLIFY_TOKEN=x bash deploy-step.sh; echo "exit $?"
IS_RELEASE=false DEV_WEBHOOK= PROD_WEBHOOK=https://example.invalid/prod COOLIFY_TOKEN=x bash deploy-step.sh; echo "exit $?"
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
- The first release also needs the 43 historical tags pushed first (MDRS-17
  §3–§4, MDRS-86 §4 step 4). Every currently open release-please PR is from the
  anchorless first run and proposes a spurious version.
