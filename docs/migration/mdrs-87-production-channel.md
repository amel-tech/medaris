# MDRS-87 — Production channel: `stable` on release, webhook by event

Stacked on MDRS-86 (development on `latest`). This record covers only the
repository half; the Coolify `production` applications and the first release
are tracked on the issue and are not done as of this writing.

## What changed

| File | Change |
| -- | -- |
| `.github/workflows/{tedrisat-api,teskilat-api,tedris-web,nizam-web,nazir-web,landing-web}.yaml` | `metadata-action` gains `type=raw,value=stable,enable=${{ github.event_name == 'release' }}`; the *Deploy to Coolify* step picks `<APP>_PROD_COOLIFY_WEBHOOK` on a `release` and the existing `<APP>_COOLIFY_WEBHOOK` otherwise, each checked on its own so an unset secret fails naming itself and never falls back to the other channel |
| `docs/runbooks/deploy-*.md` (6) | §1 tag table and rule block carry `stable`; §2 describes the two channels; §3 Path B names `stable` for production |

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

- The six workflow files parse as YAML; the deploy step's script passes
  `bash -n` and was run locally in both branches with the needed secret empty:
  `IS_RELEASE=true` names `<APP>_PROD_COOLIFY_WEBHOOK` and exits 1,
  `IS_RELEASE=false` names `<APP>_COOLIFY_WEBHOOK` and exits 1.

## Not verified

- No release has been created from `medaris`, so `stable` has never been
  pushed and the production branch of the deploy step has never run for real.
  The issue's first acceptance criterion is exactly that measurement.
