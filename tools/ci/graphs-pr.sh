#!/usr/bin/env bash
# On a pull request (.github/workflows/graphs.yaml): what it changes in the graphs, in words, as one comment kept up to
# date, and the pages of the changed graphs under _pages/ for the workflow's artifact. Reads BASE (the base commit) and
# GH_TOKEN; `delurio` is on PATH.
set -euo pipefail
delurio=delurio
marker='<!-- delurio-graph-diff -->'

# every graph folder a changed file belongs to (the nearest folder above it with flow.yaml or nav.yaml)
graph_of() {
  local d
  d=$(dirname "$1")
  while [ "$d" != "." ] && [ "$d" != "/" ]; do
    if [ -f "$d/flow.yaml" ] || [ -f "$d/nav.yaml" ] || git cat-file -e "$BASE:$d/flow.yaml" 2>/dev/null || git cat-file -e "$BASE:$d/nav.yaml" 2>/dev/null; then
      echo "$d"
      return
    fi
    d=$(dirname "$d")
  done
}
mapfile -t files < <(git diff --name-only "$BASE" HEAD -- graphs | grep -v '/viz/' || true)
domains=()
declare -A seen
dirs=()
for f in "${files[@]}"; do
  case "$f" in graphs/*/domain/domain.yaml) domains+=("$f") ;; esac
  g=$(graph_of "$f")
  if [ -n "$g" ] && [ -z "${seen[$g]:-}" ]; then
    seen[$g]=1
    dirs+=("$g")
  fi
done

# a changed API of an area is compared through the area's flows, which read it
for f in "${domains[@]}"; do
  for flow in "$(dirname "$(dirname "$f")")"/*/flow.yaml; do
    [ -f "$flow" ] || continue
    g=$(dirname "$flow")
    if [ -z "${seen[$g]:-}" ]; then
      seen[$g]=1
      dirs+=("$g")
    fi
  done
done

body="$marker"$'\n'"## What this pull request changes in the graphs"$'\n\n'
if [ ${#dirs[@]} -eq 0 ] && [ ${#domains[@]} -eq 0 ]; then
  body+="No graph changes."$'\n'
fi
for f in "${domains[@]}"; do
  body+="The API of an area changed (\`$f\`); the flows below are compared with it."$'\n\n'
done
mkdir -p _pages
for d in "${dirs[@]}"; do
  if [ ! -f "$d/flow.yaml" ] && [ ! -f "$d/nav.yaml" ]; then
    body+="### \`$d\`"$'\n'"Removed."$'\n\n'
    continue
  fi
  "$delurio" page "$d" --out "_pages/$d" >/dev/null 2>&1 || true
  if git cat-file -e "$BASE:$d/flow.yaml" 2>/dev/null || git cat-file -e "$BASE:$d/nav.yaml" 2>/dev/null; then
    body+="$("$delurio" diff "$d" --base "$BASE" --head HEAD 2>&1 || true)"$'\n\n'
  else
    body+="### \`$d\`"$'\n'"A new graph; its page is in the workflow's artifact."$'\n\n'
  fi
done
body+="Pages of the changed graphs: the \`delurio\` artifact of [this run](${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID})."
if [ ${#body} -gt 60000 ]; then
  body="${body:0:60000}"$'\n\n'"(cut: the full text is in the run's log)"
fi

# A pull request from a fork runs with a read-only token: the summary still has the text, and no comment is written.
if [ "$(jq -r .pull_request.head.repo.full_name "$GITHUB_EVENT_PATH")" != "$GITHUB_REPOSITORY" ]; then
  echo "$body"
  exit 0
fi
pr=$(jq -r .pull_request.number "$GITHUB_EVENT_PATH")
id=$(gh api "repos/$GITHUB_REPOSITORY/issues/$pr/comments" --paginate --jq ".[] | select(.body | startswith(\"$marker\")) | .id" | head -n1)
if [ -n "$id" ]; then
  gh api -X PATCH "repos/$GITHUB_REPOSITORY/issues/comments/$id" -f body="$body" >/dev/null
else
  gh api "repos/$GITHUB_REPOSITORY/issues/$pr/comments" -f body="$body" >/dev/null
fi
echo "$body"
