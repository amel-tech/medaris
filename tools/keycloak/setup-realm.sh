#!/usr/bin/env bash
# tools/keycloak/setup-realm.sh — MDRS-42
#
# Idempotent setup of the Keycloak realm the tedrisat API and the web apps
# authenticate against. Ported from madrasah-backend PR #80
# (scripts/setup-keycloak.sh) and adapted to the monorepo; the differences are
# listed in docs/migration/mdrs-42-keycloak-clients.md.
#
# Creates, when missing:
#   realm         amel-tech-dev (REALM)
#   API client    tedrisat-api — confidential, every login flow disabled. It
#                 exists only to be named in `aud`; nothing logs in through it.
#   web clients   tedris-dev, nizam-dev, nazir-dev (WEB_CLIENTS) — confidential
#                 (NextAuth holds the secret server-side), standard flow only,
#                 PKCE S256 required, each with an audience mapper that puts
#                 `tedrisat-api` into the access token's `aud`.
#   test users    owner-user / stranger-user — only with --with-test-users,
#                 only against a localhost Keycloak, and only in a realm that
#                 holds no other user.
#
# A second run changes nothing and prints `exists` for every step. An EXISTING
# client is never reconfigured: its redirect URIs, flows and secret are left as
# they are, and only a missing audience mapper is added. That makes the script
# safe to point at a realm that already serves users; a client whose settings
# drift from the ones above is reported as a warning, not overwritten.
#
# Against a remote Keycloak a MISSING web client is only created when
# WEB_CLIENTS was set explicitly. The defaults are localhost origins, and a
# client created from them on a shared realm would send authorization codes to
# whatever listens on a user's localhost.
#
# Talks to the admin REST API with curl + jq, so it needs no container exec and
# works against any reachable Keycloak.
#
# Usage:
#   tools/keycloak/setup-realm.sh [--with-test-users] [--print-secrets]
#
# Environment:
#   KC_URL              default http://localhost:8080
#   KC_ADMIN_USER       default admin (localhost only; required otherwise)
#   KC_ADMIN_PASSWORD   default admin (localhost only; required otherwise)
#   REALM               default amel-tech-dev
#   API_CLIENT_ID       default tedrisat-api
#   WEB_CLIENTS         default "tedris-dev=http://localhost:4000
#                                nizam-dev=http://localhost:4001
#                                nazir-dev=http://localhost:4002"
#                       (localhost only; a remote run needs it set to create
#                       a missing client)
#   ALLOW_REMOTE=1      required to run against a non-localhost KC_URL
#   ALLOW_INSECURE_HTTP=1
#                       required on top of ALLOW_REMOTE to reach a remote
#                       Keycloak over http://, which sends the admin password
#                       in cleartext. Prefer https://; this exists for a
#                       trusted local network and for the e2e suite, which
#                       drives the remote path against a container.

set -euo pipefail

KC_URL="${KC_URL:-http://localhost:8080}"
KC_URL="${KC_URL%/}"
REALM="${REALM:-amel-tech-dev}"
API_CLIENT_ID="${API_CLIENT_ID:-tedrisat-api}"
WEB_CLIENTS_EXPLICIT="${WEB_CLIENTS:+1}"
WEB_CLIENTS="${WEB_CLIENTS:-tedris-dev=http://localhost:4000 nizam-dev=http://localhost:4001 nazir-dev=http://localhost:4002}"

WITH_TEST_USERS=0
PRINT_SECRETS=0
for arg in "$@"; do
  case "$arg" in
    --with-test-users) WITH_TEST_USERS=1 ;;
    --print-secrets) PRINT_SECRETS=1 ;;
    -h | --help)
      sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "setup-realm: unknown argument '$arg'" >&2
      exit 2
      ;;
  esac
done

for bin in curl jq; do
  command -v "$bin" >/dev/null || {
    echo "setup-realm: '$bin' is required" >&2
    exit 1
  }
done

# Classified on the host curl will actually connect to, not on a URL prefix:
# `http://localhost:8080@auth.example.org` starts with `http://localhost:` but
# sends everything, admin credentials included, to auth.example.org.
kc_host="${KC_URL#*://}"
kc_host="${kc_host%%/*}"
kc_host="${kc_host##*@}"
kc_host="${kc_host%%:*}"
is_local=0
if [[ "$KC_URL" == http://* ]]; then
  case "$kc_host" in
    localhost | 127.0.0.1) is_local=1 ;;
  esac
fi

if [[ $is_local -eq 0 ]]; then
  if [[ "${ALLOW_REMOTE:-}" != "1" ]]; then
    echo "setup-realm: $KC_URL is not localhost. Set ALLOW_REMOTE=1 to confirm you mean to change that realm." >&2
    exit 1
  fi
  if [[ -z "${KC_ADMIN_USER:-}" || -z "${KC_ADMIN_PASSWORD:-}" ]]; then
    echo "setup-realm: KC_ADMIN_USER and KC_ADMIN_PASSWORD have no default for a remote Keycloak." >&2
    exit 1
  fi
  # Remote AND cleartext are two separate refusals. ALLOW_REMOTE says "yes, that
  # realm"; it says nothing about the transport. Over http:// `authenticate`
  # posts the MASTER realm admin password, and whoever is on the path also gets
  # the admin bearer token it returns and every write made with it.
  if [[ "$KC_URL" == http://* && "${ALLOW_INSECURE_HTTP:-}" != "1" ]]; then
    echo "setup-realm: $KC_URL would send the admin password in cleartext. Use https://, or set ALLOW_INSECURE_HTTP=1 if this is a trusted local network." >&2
    exit 1
  fi
  if [[ $WITH_TEST_USERS -eq 1 || $PRINT_SECRETS -eq 1 ]]; then
    echo "setup-realm: --with-test-users and --print-secrets are localhost-only." >&2
    exit 1
  fi
fi

KC_ADMIN_USER="${KC_ADMIN_USER:-admin}"
KC_ADMIN_PASSWORD="${KC_ADMIN_PASSWORD:-admin}"

TOKEN=""
authenticate() {
  TOKEN=$(curl -sS --fail-with-body -X POST \
    "$KC_URL/realms/master/protocol/openid-connect/token" \
    --data-urlencode grant_type=password \
    --data-urlencode client_id=admin-cli \
    --data-urlencode "username=$KC_ADMIN_USER" \
    --data-urlencode "password=$KC_ADMIN_PASSWORD" | jq -r .access_token)
  [[ -n "$TOKEN" && "$TOKEN" != "null" ]] || {
    echo "setup-realm: could not authenticate to $KC_URL as $KC_ADMIN_USER" >&2
    exit 1
  }
}

# api METHOD PATH [JSON] — prints the response body, fails on a non-2xx.
api() {
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS --fail-with-body -X "$method" "$KC_URL/admin$path"
    -H "Authorization: Bearer $TOKEN")
  if [[ -n "$body" ]]; then
    args+=(-H "Content-Type: application/json" --data "$body")
  fi
  curl "${args[@]}"
}

# status PATH — prints the HTTP status of a GET, without failing.
status() {
  curl -sS -o /dev/null -w '%{http_code}' "$KC_URL/admin$1" \
    -H "Authorization: Bearer $TOKEN"
}

client_uuid() {
  api GET "/realms/$REALM/clients?clientId=$(jq -rn --arg v "$1" '$v|@uri')" |
    jq -r --arg id "$1" '[.[] | select(.clientId == $id)][0].id // empty'
}

warn() { echo "      warning: $*" >&2; }

authenticate

echo "[1/4] realm $REALM"
if [[ "$(status "/realms/$REALM")" == "200" ]]; then
  echo "      exists"
else
  api POST /realms "$(jq -n --arg r "$REALM" '{realm: $r, enabled: true}')" >/dev/null
  echo "      created"
fi

echo "[2/4] API client $API_CLIENT_ID"
api_uuid=$(client_uuid "$API_CLIENT_ID")
if [[ -n "$api_uuid" ]]; then
  echo "      exists"
else
  api POST "/realms/$REALM/clients" "$(jq -n --arg id "$API_CLIENT_ID" '{
    clientId: $id,
    enabled: true,
    protocol: "openid-connect",
    publicClient: false,
    standardFlowEnabled: false,
    implicitFlowEnabled: false,
    directAccessGrantsEnabled: false,
    serviceAccountsEnabled: false,
    attributes: {"oauth2.device.authorization.grant.enabled": "false"}
  }')" >/dev/null
  echo "      created"
fi

echo "[3/4] web clients"
for entry in $WEB_CLIENTS; do
  client_id="${entry%%=*}"
  origin="${entry#*=}"
  origin="${origin%/}"
  uuid=$(client_uuid "$client_id")

  if [[ -n "$uuid" ]]; then
    echo "      $client_id exists"
    current=$(api GET "/realms/$REALM/clients/$uuid")
    [[ "$(jq -r .publicClient <<<"$current")" == "false" ]] ||
      warn "$client_id is a public client; NextAuth authenticates with a secret, so it must be confidential"
    [[ "$(jq -r '.attributes["pkce.code.challenge.method"] // ""' <<<"$current")" == "S256" ]] ||
      warn "$client_id does not require PKCE S256"
    [[ "$(jq -r .directAccessGrantsEnabled <<<"$current")" == "false" ]] ||
      warn "$client_id allows the password grant"
    [[ "$(jq -r .implicitFlowEnabled <<<"$current")" == "false" ]] ||
      warn "$client_id allows the implicit flow; it is about to receive the $API_CLIENT_ID audience"
    [[ "$(jq -r .serviceAccountsEnabled <<<"$current")" == "false" ]] ||
      warn "$client_id has a service account, which can mint an $API_CLIENT_ID token with no user"
  elif [[ $is_local -eq 0 && -z "$WEB_CLIENTS_EXPLICIT" ]]; then
    warn "$client_id does not exist on this realm and was not created; set WEB_CLIENTS with its real origin to create it"
    continue
  else
    api POST "/realms/$REALM/clients" "$(jq -n --arg id "$client_id" --arg o "$origin" '{
      clientId: $id,
      enabled: true,
      protocol: "openid-connect",
      publicClient: false,
      clientAuthenticatorType: "client-secret",
      standardFlowEnabled: true,
      implicitFlowEnabled: false,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: false,
      redirectUris: [($o + "/*")],
      webOrigins: [$o],
      attributes: {
        "pkce.code.challenge.method": "S256",
        "post.logout.redirect.uris": ($o + "/*")
      }
    }')" >/dev/null
    uuid=$(client_uuid "$client_id")
    echo "      $client_id created ($origin)"
  fi

  mapper="audience-$API_CLIENT_ID"
  if api GET "/realms/$REALM/clients/$uuid/protocol-mappers/models" |
    jq -e --arg n "$mapper" 'any(.[]; .name == $n)' >/dev/null; then
    echo "        audience mapper exists"
  else
    api POST "/realms/$REALM/clients/$uuid/protocol-mappers/models" "$(jq -n \
      --arg n "$mapper" --arg aud "$API_CLIENT_ID" '{
      name: $n,
      protocol: "openid-connect",
      protocolMapper: "oidc-audience-mapper",
      config: {
        "included.client.audience": $aud,
        "access.token.claim": "true",
        "id.token.claim": "false",
        "introspection.token.claim": "true"
      }
    }')" >/dev/null
    echo "        audience mapper created (aud += $API_CLIENT_ID)"
  fi
done

echo "[4/4] test users"
if [[ $WITH_TEST_USERS -eq 0 ]]; then
  echo "      skipped (pass --with-test-users on a localhost Keycloak)"
else
  # The localhost check reads the URL, and a port-forward to a shared realm
  # reads as localhost too. So the realm itself must also look throwaway: it
  # may hold no user other than the two created here.
  others=$(api GET "/realms/$REALM/users?briefRepresentation=true&max=3" |
    jq -r '[.[].username | select(. != "owner-user" and . != "stranger-user")] | length')
  if [[ "$others" != "0" ]]; then
    echo "setup-realm: realm $REALM already has other users; --with-test-users only runs against a throwaway realm." >&2
    exit 1
  fi
  for username in owner-user stranger-user; do
    found=$(api GET "/realms/$REALM/users?exact=true&username=$username" | jq -r '.[0].id // empty')
    if [[ -n "$found" ]]; then
      echo "      $username exists"
    else
      # The password equals the username: these users exist only in a
      # throwaway local realm, which the localhost and other-users guards
      # above enforce.
      api POST "/realms/$REALM/users" "$(jq -n --arg u "$username" '{
        username: $u,
        enabled: true,
        emailVerified: true,
        email: ($u + "@example.test"),
        firstName: $u,
        lastName: "Test",
        requiredActions: [],
        credentials: [{type: "password", value: $u, temporary: false}]
      }')" >/dev/null
      echo "      $username created (password: $username)"
    fi
  done
fi

if [[ $PRINT_SECRETS -eq 1 ]]; then
  echo
  echo "client secrets (local realm only — never commit these):"
  for entry in $WEB_CLIENTS; do
    client_id="${entry%%=*}"
    uuid=$(client_uuid "$client_id")
    printf '  %-12s %s\n' "$client_id" \
      "$(api GET "/realms/$REALM/clients/$uuid/client-secret" | jq -r .value)"
  done
fi

cat <<EOF

Done. The API side of this realm:
  KEYCLOAK_JWKS_URL=$KC_URL/realms/$REALM/protocol/openid-connect/certs
  KEYCLOAK_ISSUER=$KC_URL/realms/$REALM
  KEYCLOAK_AUDIENCE=$API_CLIENT_ID
  KEYCLOAK_ALLOWED_CLIENTS=$(for e in $WEB_CLIENTS; do printf '%s,' "${e%%=*}"; done | sed 's/,$//')
EOF
