# shellcheck shell=bash
# config/keycloak/scripts/lib/core.sh — shared by provision, dry-run, verify
# and validate (MDRS-97). Not meant to be run on its own.
#
# Reads:
#   KC_CONFIG_DIR   the package root; default: the directory above scripts/.
#                   The e2e suite points it at an edited copy.
#   KC_REALM        default medaris; realms/<KC_REALM>.json must exist
#   KC_URL, KC_ADMIN_USER, KC_ADMIN_PASSWORD, ALLOW_REMOTE, ALLOW_INSECURE_HTTP
#                   see RUNBOOK.md; the rules match tools/keycloak/setup-realm.sh
#   KC_CLIENT_SECRET_<CLIENT>
#                   optional client secret; <CLIENT> is the clientId upper-cased
#                   with every non-alphanumeric character turned into `_`
#                   (tedris -> KC_CLIENT_SECRET_TEDRIS)
#   KC_SMTP_*       see lib/smtp.sh

set -euo pipefail
# Byte-wise character ranges: under a Turkish locale `[a-z]` does not contain
# `i`, and `medaris` would fail its own name check.
export LC_ALL=C

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KC_CONFIG_DIR="${KC_CONFIG_DIR:-$(dirname "$SCRIPTS_DIR")}"
KC_CONFIG_DIR="${KC_CONFIG_DIR%/}"
KC_REALM="${KC_REALM:-medaris}"
PREFIX="${PREFIX:-keycloak}"

# shellcheck source=./smtp.sh
source "$SCRIPTS_DIR/lib/smtp.sh"

die() {
  echo "$PREFIX: $*" >&2
  exit 1
}

# The realm name becomes a file name and a URL path segment.
[[ "$KC_REALM" =~ ^[a-z0-9][a-z0-9-]*$ ]] ||
  die "KC_REALM '$KC_REALM' is not a realm name (lower-case letters, digits, -)"

require_tools() {
  local bin
  for bin in "$@"; do
    command -v "$bin" >/dev/null || die "'$bin' is required"
  done
}

# read_env_arg ARG — the environment name: one directory under clients/.
read_env_arg() {
  local name="${1:-}"
  [[ -n "$name" ]] || die "usage: $(basename "$0") <env>   (one of: $(list_envs))"
  [[ "$name" =~ ^[a-z0-9][a-z0-9-]*$ ]] || die "'$name' is not an environment name"
  [[ -d "$KC_CONFIG_DIR/clients/$name" ]] ||
    die "no clients/$name/ in $KC_CONFIG_DIR (environments: $(list_envs))"
  ENV_NAME="$name"
}

# Portable on purpose: BSD find (macOS) has no -printf.
list_envs() {
  local dir names=()
  for dir in "$KC_CONFIG_DIR"/clients/*/; do
    [[ -d "$dir" ]] && names+=("$(basename "$dir")")
  done
  echo "${names[*]:-}"
}

client_files() {
  find "$KC_CONFIG_DIR/clients/$ENV_NAME" -maxdepth 1 -type f -name '*.json' | sort
}

# render_realm — realms/_base.json deep-merged with realms/<realm>.json.
render_realm() {
  jq -s '.[0] * .[1]' "$KC_CONFIG_DIR/realms/_base.json" \
    "$KC_CONFIG_DIR/realms/$KC_REALM.json"
}

# secret_var CLIENT_ID — KC_CLIENT_SECRET_<CLIENT_ID in ASCII upper case, every
# other character `_`>. jq, not tr: under a Turkish locale `tr` upper-cases
# `i` to `İ`, and `tedris` would become KC_CLIENT_SECRET_TEDR_S.
secret_var() {
  jq -rn --arg v "$1" '"KC_CLIENT_SECRET_" + ($v | ascii_upcase | gsub("[^A-Z0-9]"; "_"))'
}

# render_client FILE — clients/_base.json deep-merged with FILE, plus the
# client secret when its KC_CLIENT_SECRET_* variable is set. jq reads the
# secret through $ENV, so it never appears in an argv.
render_client() {
  local file="$1" id var
  id=$(jq -r .clientId "$file")
  var=$(secret_var "$id")
  if [[ -n "${!var:-}" ]]; then
    export "${var?}"
  fi
  jq -s --arg var "$var" '
    (.[0] * .[1])
    + (if ($ENV[$var] // "") != "" then {secret: $ENV[$var]} else {} end)' \
    "$KC_CONFIG_DIR/clients/_base.json" "$file"
}

# ---------------------------------------------------------------------------
# Target and credentials — the same refusals as tools/keycloak/setup-realm.sh.

check_target() {
  KC_URL="${KC_URL:-http://localhost:8080}"
  KC_URL="${KC_URL%/}"
  # Classified on the host curl will actually connect to, not on a URL prefix:
  # `http://localhost:8080@auth.example.org` goes to auth.example.org.
  local host="${KC_URL#*://}"
  host="${host%%/*}"
  host="${host##*@}"
  host="${host%%:*}"
  IS_LOCAL=0
  if [[ "$KC_URL" == http://* ]]; then
    case "$host" in
      localhost | 127.0.0.1) IS_LOCAL=1 ;;
    esac
  fi
  if [[ $IS_LOCAL -eq 0 ]]; then
    [[ "${ALLOW_REMOTE:-}" == "1" ]] ||
      die "$KC_URL is not localhost. Set ALLOW_REMOTE=1 to confirm you mean to change that realm."
    [[ -n "${KC_ADMIN_USER:-}" && -n "${KC_ADMIN_PASSWORD:-}" ]] ||
      die "KC_ADMIN_USER and KC_ADMIN_PASSWORD have no default for a remote Keycloak."
    if [[ "$KC_URL" == http://* && "${ALLOW_INSECURE_HTTP:-}" != "1" ]]; then
      die "$KC_URL would send the admin password in cleartext. Use https://, or set ALLOW_INSECURE_HTTP=1 if this is a trusted local network."
    fi
  fi
  KC_ADMIN_USER="${KC_ADMIN_USER:-admin}"
  KC_ADMIN_PASSWORD="${KC_ADMIN_PASSWORD:-admin}"
  export KC_ADMIN_USER KC_ADMIN_PASSWORD
}

TOKEN=""
# The admin password goes to curl on stdin and the bearer token through a
# header file descriptor: neither is ever an argument, since a command line is
# readable by every user of the machine (MDRS-98 follow-up).
authenticate() {
  local body
  body=$(jq -rn '"grant_type=password&client_id=admin-cli"
    + "&username=" + ($ENV.KC_ADMIN_USER | @uri)
    + "&password=" + ($ENV.KC_ADMIN_PASSWORD | @uri)')
  TOKEN=$(printf '%s' "$body" | curl -sS --fail-with-body -X POST \
    "$KC_URL/realms/master/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data-binary @- | jq -r .access_token) || true
  [[ -n "$TOKEN" && "$TOKEN" != "null" ]] ||
    die "could not authenticate to $KC_URL as $KC_ADMIN_USER"
  TOKEN_AT=$SECONDS
}

# fresh_token — a master-realm admin token lives 60 seconds; a run against a
# slow remote Keycloak can take longer, so it is renewed after 45.
fresh_token() {
  if ((SECONDS - ${TOKEN_AT:-0} >= 45)); then
    authenticate
  fi
}

# api METHOD PATH [JSON] — prints the response body, fails on a non-2xx. The
# body goes on stdin: it can carry a secret.
api() {
  local method="$1" path="$2" body="${3:-}"
  fresh_token
  # The header file is opened inline: a process substitution stored in an
  # array is closed before curl gets to read it.
  if [[ -n "$body" ]]; then
    printf '%s' "$body" | curl -sS --fail-with-body -X "$method" \
      "$KC_URL/admin$path" \
      -H @<(printf 'Authorization: Bearer %s\n' "$TOKEN") \
      -H "Content-Type: application/json" --data-binary @-
  else
    curl -sS --fail-with-body -X "$method" "$KC_URL/admin$path" \
      -H @<(printf 'Authorization: Bearer %s\n' "$TOKEN")
  fi
}

# status PATH — the HTTP status of a GET, without failing.
status() {
  fresh_token
  curl -sS -o /dev/null -w '%{http_code}' "$KC_URL/admin$1" \
    -H @<(printf 'Authorization: Bearer %s\n' "$TOKEN")
}

# exists PATH — 0 on 200, 1 on 404, and the run stops on anything else: a 401,
# 403 or 5xx must not be mistaken for "missing" and answered with a POST.
exists() {
  local code
  code=$(status "$1") || true
  case "$code" in
    200) return 0 ;;
    404) return 1 ;;
    *) die "GET $1 answered $code" ;;
  esac
}

uri() { jq -rn --arg v "$1" '$v|@uri'; }

client_uuid() {
  api GET "/realms/$KC_REALM/clients?clientId=$(uri "$1")" |
    jq -r --arg id "$1" '[.[] | select(.clientId == $id)][0].id // empty'
}

# ---------------------------------------------------------------------------
# Comparison. The repository is compared as a subset of the server: a key the
# repository does not set is not reported. Arrays of objects with a `name`
# (protocol mappers, user-profile attributes, roles) are matched by name, and
# a named element the server has and the repository does not is reported too.
# Other arrays compare as sets.

# diff_json REPO SERVER LABEL — prints one line per difference; secrets masked.
# Both documents reach jq on stdin: the repository side can hold a client
# secret, and an --argjson would put it on jq's command line.
diff_json() {
  printf '%s\n%s\n' "$1" "$2" | jq -rs --arg label "$3" '
    .[0] as $d | .[1] as $a |
    def named: type == "array" and length > 0
      and all(.[]; type == "object" and has("name"));
    def walk_diff($d; $a; $p):
      if ($d | type) == "object" then
        if ($a | type) != "object" then [{p: $p, d: $d, a: $a}]
        else [$d | keys_unsorted[] as $k | walk_diff($d[$k]; $a[$k]; $p + "." + $k)[]]
        end
      elif ($d | named) then
        (if ($a | type) == "array" then $a else [] end) as $list
        | [$d[] as $e
            | ($list | map(select(type == "object" and .name == $e.name)) | .[0]) as $m
            | if $m == null
              then {p: ($p + "[" + $e.name + "]"), d: "present", a: "missing"}
              else walk_diff($e; $m; $p + "[" + $e.name + "]")[] end]
          + [$list[] | select(type == "object" and has("name"))
              | .name as $n | select(all($d[]; .name != $n))
              | {p: ($p + "[" + $n + "]"), d: "missing", a: "present"}]
      elif ($d | type) == "array" then
        if ($a | type) == "array" and ($d | sort) == ($a | sort) then []
        else [{p: $p, d: $d, a: $a}] end
      elif $d == $a then []
      else [{p: $p, d: $d, a: $a}]
      end;
    walk_diff($d; $a; $label)[]
    | if (.p | test("secret|password"; "i"))
      then "\(.p): differs (value hidden)"
      else "\(.p): repository \(.d | tojson), server \(.a | tojson)" end'
}

# ---------------------------------------------------------------------------
# The plan. MODE is apply (provision), plan (dry-run) or check (verify). Every
# part is compared first; apply then writes exactly the parts that differ,
# through the Admin API's POST for what is missing and PUT for what exists —
# never "skip because it exists".

DIFFERENCES=0

report() { # report PART STATE [DETAIL-LINES]
  local part="$1" state="$2" detail="${3:-}"
  printf '%s: %s\n' "$part" "$state"
  if [[ -n "$detail" ]]; then
    sed 's/^/    /' <<<"$detail"
  fi
}

verb() { # verb CREATE|UPDATE
  case "$MODE:$1" in
    apply:CREATE) echo created ;;
    apply:UPDATE) echo updated ;;
    plan:CREATE) echo "would create" ;;
    plan:UPDATE) echo "would update" ;;
    check:CREATE) echo "missing" ;;
    check:UPDATE) echo "differs" ;;
  esac
}

run_plan() {
  MODE="$1"
  local realm realm_settings roles
  realm=$(render_realm)
  realm_settings=$(jq 'del(.roles)' <<<"$realm")
  roles=$(jq '.roles.realm // []' <<<"$realm")

  smtp_check "$PREFIX"
  check_target
  authenticate

  # --- realm -----------------------------------------------------------------
  if ! exists "/realms/$KC_REALM"; then
    DIFFERENCES=$((DIFFERENCES + 1))
    if [[ "$MODE" != "apply" ]]; then
      report "realm $KC_REALM" "$(verb CREATE)"
      echo "$PREFIX: realm $KC_REALM does not exist; nothing below it can be compared."
      return 0
    fi
    # The whole realm in one import, roles included. The mail sender follows
    # in its own step so the password is sent exactly one way.
    api POST /realms "$realm" >/dev/null
    report "realm $KC_REALM" "$(verb CREATE)"
  else
    local current changes
    current=$(api GET "/realms/$KC_REALM")
    changes=$(diff_json "$realm_settings" "$current" realm)
    if [[ -z "$changes" ]]; then
      report "realm $KC_REALM" "in sync"
    else
      DIFFERENCES=$((DIFFERENCES + $(wc -l <<<"$changes")))
      report "realm $KC_REALM" "$(verb UPDATE)" "$changes"
      if [[ "$MODE" == "apply" ]]; then
        api PUT "/realms/$KC_REALM" "$realm_settings" >/dev/null
      fi
    fi
  fi

  # --- mail sender -----------------------------------------------------------
  if [[ -z "${KC_SMTP_HOST:-}" ]]; then
    report "mail sender" "skipped (set KC_SMTP_HOST to configure it)"
    if [[ "$(jq -r .verifyEmail <<<"$realm")" == "true" ]]; then
      local host
      host=$(api GET "/realms/$KC_REALM" | jq -r '.smtpServer.host // ""')
      [[ -n "$host" ]] ||
        echo "$PREFIX: warning: the realm requires e-mail verification and has no SMTP server; registration cannot finish." >&2
    fi
  elif [[ "$MODE" == "apply" ]]; then
    # Written on every run: Keycloak returns the stored password masked, so it
    # cannot be compared, and re-sending it is how a rotation takes effect.
    api PUT "/realms/$KC_REALM" "$(smtp_server with-password | jq '{smtpServer: .}')" >/dev/null
    report "mail sender" "configured ($(smtp_describe))"
  else
    local changes
    changes=$(diff_json "$(smtp_server)" \
      "$(api GET "/realms/$KC_REALM" | jq '.smtpServer // {}')" smtpServer)
    if [[ -z "$changes" ]]; then
      report "mail sender" "in sync (password not comparable)"
    else
      DIFFERENCES=$((DIFFERENCES + $(wc -l <<<"$changes")))
      report "mail sender" "$(verb UPDATE)" "$changes"
    fi
  fi

  # --- realm roles -----------------------------------------------------------
  local name role
  while IFS= read -r role; do
    [[ -n "$role" ]] || continue
    name=$(jq -r .name <<<"$role")
    if ! exists "/realms/$KC_REALM/roles/$(uri "$name")"; then
      DIFFERENCES=$((DIFFERENCES + 1))
      if [[ "$MODE" == "apply" ]]; then
        api POST "/realms/$KC_REALM/roles" "$role" >/dev/null
      fi
      report "role $name" "$(verb CREATE)"
    else
      local changes
      changes=$(diff_json "$role" \
        "$(api GET "/realms/$KC_REALM/roles/$(uri "$name")")" "role")
      if [[ -z "$changes" ]]; then
        report "role $name" "in sync"
      else
        DIFFERENCES=$((DIFFERENCES + $(wc -l <<<"$changes")))
        report "role $name" "$(verb UPDATE)" "$changes"
        if [[ "$MODE" == "apply" ]]; then
          api PUT "/realms/$KC_REALM/roles/$(uri "$name")" "$role" >/dev/null
        fi
      fi
    fi
  done < <(jq -c '.[]' <<<"$roles")

  # --- user profile ----------------------------------------------------------
  local profile changes
  profile=$(jq -c . "$KC_CONFIG_DIR/user-profile.json")
  changes=$(diff_json "$profile" \
    "$(api GET "/realms/$KC_REALM/users/profile")" "userProfile")
  if [[ -z "$changes" ]]; then
    report "user profile" "in sync"
  else
    DIFFERENCES=$((DIFFERENCES + $(wc -l <<<"$changes")))
    report "user profile" "$(verb UPDATE)" "$changes"
    # PUT replaces the whole profile, so an attribute added by hand is dropped.
    if [[ "$MODE" == "apply" ]]; then
      api PUT "/realms/$KC_REALM/users/profile" "$profile" >/dev/null
    fi
  fi

  # --- clients ---------------------------------------------------------------
  local file client id uuid current settings mappers mapper mname mid
  while IFS= read -r file; do
    client=$(render_client "$file")
    id=$(jq -r .clientId <<<"$client")
    uuid=$(client_uuid "$id")
    if [[ -z "$uuid" ]]; then
      DIFFERENCES=$((DIFFERENCES + 1))
      if [[ "$MODE" == "apply" ]]; then
        api POST "/realms/$KC_REALM/clients" "$client" >/dev/null
      fi
      report "client $id" "$(verb CREATE)"
      continue
    fi
    current=$(api GET "/realms/$KC_REALM/clients/$uuid")
    changes=$(diff_json "$client" "$current" "client")
    if [[ -z "$changes" ]]; then
      report "client $id" "in sync"
      continue
    fi
    DIFFERENCES=$((DIFFERENCES + $(wc -l <<<"$changes")))
    report "client $id" "$(verb UPDATE)" "$changes"
    if [[ "$MODE" != "apply" ]]; then
      continue
    fi

    # A client PUT leaves protocol mappers alone, so they are written one by
    # one: POST the missing, PUT the changed. A mapper only the server has is
    # reported above and left in place.
    settings=$(jq 'del(.protocolMappers)' <<<"$client")
    api PUT "/realms/$KC_REALM/clients/$uuid" "$settings" >/dev/null
    mappers=$(jq -c '.protocolMappers // [] | .[]' <<<"$client")
    while IFS= read -r mapper; do
      [[ -n "$mapper" ]] || continue
      mname=$(jq -r .name <<<"$mapper")
      mid=$(jq -r --arg n "$mname" \
        '[.protocolMappers // [] | .[] | select(.name == $n)][0].id // empty' <<<"$current")
      if [[ -z "$mid" ]]; then
        api POST "/realms/$KC_REALM/clients/$uuid/protocol-mappers/models" "$mapper" >/dev/null
      else
        api PUT "/realms/$KC_REALM/clients/$uuid/protocol-mappers/models/$mid" \
          "$(jq -c --arg id "$mid" '. + {id: $id}' <<<"$mapper")" >/dev/null
      fi
    done <<<"$mappers"
  done < <(client_files)
}
