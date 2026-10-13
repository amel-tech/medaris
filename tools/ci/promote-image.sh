#!/usr/bin/env bash
# tools/ci/promote-image.sh — production promotes the image development built
#
# Called by the seven deploy workflows on a FULL release (event `release`, its
# own tag, `prerelease == false`). The release commit was pushed to `main`
# first, so cd-development.yaml has normally built and deployed
# `<image>:sha-<short sha>` for it already. Production should run those exact
# bytes, not a second build of the same commit: this script finds that image
# and moves the release tags onto its digest. No pull, no rebuild.
#
# Usage:
#   tools/ci/promote-image.sh <source ref> <target ref>...
#     source ref   <image>:sha-<short sha>, the tag development pushed
#     target ref   <image>:<semver>, <image>:stable
#
# Prints the promoted digest (sha256:…) on stdout, or an empty line when the
# image was not found; then the caller builds from the tag instead. Logs go to
# stderr. Exits non-zero only for bad usage or a promotion that did not land.
#
# When the image is missing, development may still be building it:
# release-please merges several release PRs within minutes, and each merge is
# a push that queues a cd-development.yaml run. So while a run of that
# workflow for this commit is queued or in progress, the script waits
# (POLL_SECONDS, up to WAIT_SECONDS) and looks again. It stops waiting as soon
# as no such run is pending: a run that finished without pushing the image was
# cancelled (a newer push replaced it while it was pending), failed, or did
# not build this app, and waiting longer cannot change that.
#
# Environment:
#   GITHUB_REPOSITORY   owner/repo (set by Actions)
#   COMMIT_SHA          the release commit (default: GITHUB_SHA)
#   GH_TOKEN            token for `gh api`; the job needs `actions: read`
#   CD_WORKFLOW         default cd-development.yaml
#   WAIT_SECONDS        default 1200 (20 minutes)
#   POLL_SECONDS        default 20
#
# Needs docker with buildx, and gh; both are on GitHub's ubuntu runners.

set -euo pipefail

log() { echo "promote-image: $*" >&2; }
fail() {
  log "$*"
  exit 1
}

[ "$#" -ge 2 ] || fail "usage: promote-image.sh <source ref> <target ref>..."
source_ref=$1
shift
case "$source_ref" in
  *@*) fail "the source must be a tag, not a digest: $source_ref" ;;
  */*:*) ;;
  *) fail "the source has no tag: $source_ref" ;;
esac
image=${source_ref%:*}
for target in "$@"; do
  [ "${target%:*}" = "$image" ] && [ "$target" != "$image" ] ||
    fail "target $target is not a tag of $image"
done

sha=${COMMIT_SHA:-${GITHUB_SHA:-}}
[ -n "$sha" ] || fail "COMMIT_SHA (or GITHUB_SHA) is not set"
[ -n "${GITHUB_REPOSITORY:-}" ] || fail "GITHUB_REPOSITORY is not set"
workflow=${CD_WORKFLOW:-cd-development.yaml}
wait_seconds=${WAIT_SECONDS:-1200}
poll_seconds=${POLL_SECONDS:-20}

# The digest a ref points at, or nothing when it does not exist. Any failure
# counts as "not there": the caller then builds from the tag, which is safe,
# and the log keeps what inspect said, so a registry or auth error is visible.
digest_of() {
  local out
  if out=$(docker buildx imagetools inspect "$1" --format '{{.Manifest.Digest}}' 2>&1); then
    printf '%s\n' "$out"
  else
    log "not found: $1 ($(printf '%s' "$out" | tail -n 1))"
  fi
}

# One line per run of the CD workflow for the commit: "<id> <status> <conclusion>".
cd_runs() {
  gh api "repos/${GITHUB_REPOSITORY}/actions/workflows/${workflow}/runs?head_sha=${sha}&per_page=100" \
    --jq '.workflow_runs[] | "\(.id) \(.status) \(.conclusion // "-")"'
}

digest=$(digest_of "$source_ref")
deadline=$((SECONDS + wait_seconds))
api_failures=0
while [ -z "$digest" ]; do
  why=""
  if runs=$(cd_runs); then
    api_failures=0
    pending=$(printf '%s\n' "$runs" | awk 'NF && $2 != "completed"' | wc -l)
    if [ "$pending" -eq 0 ]; then
      why="no ${workflow} run for ${sha} is queued or in progress"
    elif [ "$SECONDS" -ge "$deadline" ]; then
      why="gave up after ${wait_seconds}s with ${pending} ${workflow} run(s) for ${sha} unfinished"
    fi
  else
    runs=""
    api_failures=$((api_failures + 1))
    if [ "$api_failures" -ge 3 ]; then
      why="could not list ${workflow} runs for ${sha} (the job needs actions: read)"
    fi
  fi
  if [ -n "$why" ]; then
    # Last look: the run can push the image between the inspect above and the
    # run listing that saw it finished.
    digest=$(digest_of "$source_ref")
    if [ -z "$digest" ]; then
      log "$why"
      [ -z "$runs" ] || printf '%s\n' "$runs" | sed 's/^/promote-image:   run /' >&2
    fi
    break
  fi
  log "waiting ${poll_seconds}s for ${workflow} to finish for ${sha}"
  sleep "$poll_seconds"
  digest=$(digest_of "$source_ref")
done

if [ -z "$digest" ]; then
  echo ""
  exit 0
fi

log "found ${source_ref} at ${digest}"
args=()
for target in "$@"; do
  args+=(--tag "$target")
done
docker buildx imagetools create "${args[@]}" "${image}@${digest}" >&2

# A tag that does not resolve to the promoted digest afterwards is a failed
# promotion, and the production webhook must not fire on it.
for target in "$@"; do
  now=$(digest_of "$target")
  [ "$now" = "$digest" ] || fail "$target resolves to '${now}', expected ${digest}"
  log "promoted ${target} -> ${digest}"
done
echo "$digest"
