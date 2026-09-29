#!/usr/bin/env bash
# tools/keycloak/smoke-theme-jar.sh — MDRS-99
#
# Proves a built theme JAR is one Keycloak actually loads. A JAR Keycloak
# cannot use does not fail anything: the realm quietly renders the built-in
# theme. So "the build produced a file" is not enough; this boots the exact
# Keycloak the repo runs with the JAR in /opt/keycloak/providers — where the
# production container loads it from — and checks three things:
#
#   1. /admin/serverinfo lists medaris-keycloak-theme as a LOGIN theme
#      (what the admin console's theme drop-down is built from).
#   2. It also lists it as an EMAIL theme.
#   3. A realm with loginTheme=medaris-keycloak-theme serves its login page
#      and its registration page through the theme: both carry keycloakify's
#      `kcContext` with the expected `pageId`, which the built-in theme never
#      emits.
#
# Usage:
#   tools/keycloak/smoke-theme-jar.sh [<path to jar>]
#     default: apps/keycloak-theme/dist_keycloak/keycloak-theme-for-kc-all-other-versions.jar
#
# Needs docker, curl and jq. Binds Keycloak to 127.0.0.1 on SMOKE_PORT
# (default 18080). The container is removed on exit, pass or fail.

set -euo pipefail

THEME_ID="medaris-keycloak-theme"
KEYCLOAK_IMAGE="quay.io/keycloak/keycloak:26.3.2"
REALM="mdrs-99-smoke"
PORT="${SMOKE_PORT:-18080}"
BASE="http://127.0.0.1:${PORT}"

repo_root=$(cd "$(dirname "$0")/../.." && pwd)
jar="${1:-$repo_root/apps/keycloak-theme/dist_keycloak/keycloak-theme-for-kc-all-other-versions.jar}"

for tool in docker curl jq; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "smoke: $tool is required" >&2
    exit 1
  }
done
[ -s "$jar" ] || {
  echo "smoke: JAR not found or empty: $jar" >&2
  exit 1
}
jar=$(cd "$(dirname "$jar")" && pwd)/$(basename "$jar")

name="mdrs-99-theme-smoke-$$"
work_dir=$(mktemp -d)
# shellcheck disable=SC2329 # invoked by the EXIT trap below
cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
  rm -rf "$work_dir"
}
trap cleanup EXIT

echo "smoke: starting $KEYCLOAK_IMAGE with $(basename "$jar") as providers/$THEME_ID.jar"
docker run -d --name "$name" \
  -p "127.0.0.1:${PORT}:8080" \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  -v "$jar:/opt/keycloak/providers/$THEME_ID.jar:ro" \
  "$KEYCLOAK_IMAGE" start-dev >/dev/null

ready=""
for _ in $(seq 1 90); do
  if curl -fs -o /dev/null "$BASE/realms/master" 2>/dev/null; then
    ready=1
    break
  fi
  sleep 2
done
if [ -z "$ready" ]; then
  echo "smoke: Keycloak did not become ready; last log lines:" >&2
  docker logs --tail 50 "$name" >&2 || true
  exit 1
fi

token=$(curl -fsS "$BASE/realms/master/protocol/openid-connect/token" \
  -d grant_type=password -d client_id=admin-cli \
  -d username=admin -d password=admin | jq -r .access_token)
auth=(-H "Authorization: Bearer $token")

serverinfo=$(curl -fsS "${auth[@]}" "$BASE/admin/serverinfo")
failed=0
for kind in login email; do
  if jq -e --arg t "$THEME_ID" --arg k "$kind" \
    '.themes[$k] // [] | map(.name) | index($t) != null' <<<"$serverinfo" >/dev/null; then
    echo "smoke: ok — serverinfo lists $THEME_ID as a $kind theme"
  else
    echo "smoke: FAIL — serverinfo does not list $THEME_ID as a $kind theme" >&2
    failed=1
  fi
done

curl -fsS "${auth[@]}" -H 'Content-Type: application/json' \
  -X POST "$BASE/admin/realms" \
  -d "{\"realm\":\"$REALM\",\"enabled\":true,\"registrationAllowed\":true,\"loginTheme\":\"$THEME_ID\"}"

redirect=$(jq -rn --arg u "$BASE/realms/$REALM/account" '$u|@uri')
# Any 43-character verifier-shaped value will do; the flow is never completed.
pkce="code_challenge=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&code_challenge_method=S256"
query="client_id=account-console&response_type=code&scope=openid&redirect_uri=$redirect&$pkce"

check_page() {
  local label="$1" page_id="$2" url="$3" page
  # `|| true`: an HTTP error must reach the FAIL branch and its log dump, not
  # end the script under `set -e` with a bare curl exit code.
  page=$(curl -fsSL -c "$work_dir/cookies" -b "$work_dir/cookies" "$url") || page=""
  if grep -q 'kcContext' <<<"$page" && grep -Eq "\"pageId\": *\"$page_id\"" <<<"$page"; then
    echo "smoke: ok — the $label page of a realm using $THEME_ID is rendered by the theme"
  else
    echo "smoke: FAIL — the $label page carries no kcContext/pageId $page_id; Keycloak fell back to a built-in theme" >&2
    docker logs --tail 50 "$name" 2>&1 | grep -i theme >&2 || true
    failed=1
  fi
}

check_page login login "$BASE/realms/$REALM/protocol/openid-connect/auth?$query"
check_page registration register "$BASE/realms/$REALM/protocol/openid-connect/registrations?$query"

exit "$failed"
