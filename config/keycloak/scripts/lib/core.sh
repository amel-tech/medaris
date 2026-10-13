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

# client_scope_files — one realm client scope per file under client-scopes/.
client_scope_files() {
  [[ -d "$KC_CONFIG_DIR/client-scopes" ]] || return 0
  find "$KC_CONFIG_DIR/client-scopes" -maxdepth 1 -type f -name '*.json' | sort
}

# Scope assignments — the client scopes a client gets by default or as
# optional, and the ones every new client of the realm gets — are written with
# Keycloak's own field names (`defaultClientScopes` and `optionalClientScopes`
# on a client, `defaultDefaultClientScopes` and `defaultOptionalClientScopes`
# on the realm) but read as "must include": a listed scope is assigned, one
# the server has beyond the list is left alone. Keycloak reads them as the
# exact list, and only when it creates the client or realm: a client created
# with `defaultClientScopes: ["gender"]` loses profile, email and roles
# (measured on 26.6.3), and a client PUT ignores them. So they never reach
# Keycloak inside a representation; the plan applies them one by one through
# the scope-assignment endpoints.
without_scope_lists() {
  jq 'del(.defaultClientScopes, .optionalClientScopes,
          .defaultDefaultClientScopes, .defaultOptionalClientScopes)'
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

client_scope_id() {
  api GET "/realms/$KC_REALM/client-scopes" |
    jq -r --arg n "$1" '[.[] | select(.name == $n)][0].id // empty'
}

# scope_changes WANT HAVE DEFAULT_FIELD OPTIONAL_FIELD LABEL — one line per
# scope WANT lists that HAVE does not have in that list. WANT and HAVE are
# {"default": [names], "optional": [names]}.
scope_changes() {
  printf '%s\n%s\n' "$1" "$2" | jq -rs --arg d "$3" --arg o "$4" --arg l "$5" '
    .[0] as $want | .[1] as $have
    | ["default", "optional"][] as $list
    | ($want[$list] // [])[] as $n
    | select((($have[$list] // []) | index($n)) == null)
    | "\($l).\(if $list == "default" then $d else $o end)[\($n)]: repository present, server missing"'
}

# apply_scope_changes BASE PREFIX WANT HAVE — assigns what scope_changes
# reports. BASE is the realm's or the client's admin path; PREFIX is
# `default-` for the realm (default-default-client-scopes) and empty for a
# client (default-client-scopes). A scope sits in one list at a time, and
# Keycloak answers a PUT into the second list with 204 and leaves the scope
# where it was (measured on 26.6.3): a new client already holds the realm's
# optional scopes, so one it must hold by default is taken out of `optional`
# first.
apply_scope_changes() {
  local base="$1" prefix="$2" want="$3" have="$4" list other name id
  for list in default optional; do
    if [[ "$list" == default ]]; then other=optional; else other=default; fi
    while IFS= read -r name; do
      [[ -n "$name" ]] || continue
      if jq -e --arg l "$list" --arg n "$name" '(.[$l] // []) | index($n)' \
        <<<"$have" >/dev/null; then
        continue
      fi
      id=$(client_scope_id "$name")
      [[ -n "$id" ]] || die "client scope $name does not exist in realm $KC_REALM"
      if jq -e --arg l "$other" --arg n "$name" '(.[$l] // []) | index($n)' \
        <<<"$have" >/dev/null; then
        api DELETE "$base/$prefix$other-client-scopes/$id" >/dev/null
      fi
      api PUT "$base/$prefix$list-client-scopes/$id" >/dev/null
    done < <(jq -r --arg l "$list" '(.[$l] // [])[]' <<<"$want")
  done
}

# write_mappers BASE MAPPERS CURRENT — POSTs the protocol mappers CURRENT
# lacks and PUTs the others; BASE is a client's or a client scope's admin
# path. A client or scope PUT leaves protocol mappers alone, so they are
# written one by one. A mapper only the server has is left in place.
write_mappers() {
  local base="$1" mappers="$2" current="$3" mapper mname mid
  while IFS= read -r mapper; do
    [[ -n "$mapper" ]] || continue
    mname=$(jq -r .name <<<"$mapper")
    mid=$(jq -r --arg n "$mname" \
      '[.protocolMappers // [] | .[] | select(.name == $n)][0].id // empty' <<<"$current")
    if [[ -z "$mid" ]]; then
      api POST "$base/protocol-mappers/models" "$mapper" >/dev/null
    else
      api PUT "$base/protocol-mappers/models/$mid" \
        "$(jq -c --arg id "$mid" '. + {id: $id}' <<<"$mapper")" >/dev/null
    fi
  done < <(jq -c '.[]' <<<"$mappers")
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
  local realm realm_settings roles realm_scopes
  realm=$(render_realm)
  realm_settings=$(jq 'del(.roles)' <<<"$realm" | without_scope_lists)
  roles=$(jq '.roles.realm // []' <<<"$realm")
  realm_scopes=$(jq -c '{default: (.defaultDefaultClientScopes // []),
                         optional: (.defaultOptionalClientScopes // [])}' <<<"$realm")

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
    # in its own step so the password is sent exactly one way, and the scope
    # assignments once the scopes exist.
    api POST /realms "$(without_scope_lists <<<"$realm")" >/dev/null
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
  # The attributes are compared by name, and their order on its own: the
  # registration and profile forms draw them in this order (canvas medaris/03).
  local profile server_profile changes order
  profile=$(jq -c . "$KC_CONFIG_DIR/user-profile.json")
  server_profile=$(api GET "/realms/$KC_REALM/users/profile")
  changes=$(diff_json "$profile" "$server_profile" "userProfile")
  order=$(printf '%s\n%s\n' "$profile" "$server_profile" | jq -rs '
    [.[0].attributes[].name] as $repo
    | [.[1].attributes // [] | .[].name | select(. as $n | $repo | index($n))] as $server
    | if ($server | length) == ($repo | length) and $server != $repo
      then "userProfile.attributes: order \($repo | join(", ")) in the repository, \($server | join(", ")) on the server"
      else empty end')
  changes=$(printf '%s\n%s' "$changes" "$order" | sed '/^$/d')
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

  # --- client scopes ---------------------------------------------------------
  # One realm client scope per file under client-scopes/, compared like a
  # client. `removedProtocolMappers` is this package's own key, not Keycloak's:
  # mappers a built-in scope carries that must go (the `profile` scope's
  # `gender`, so that only the `gender` scope puts that claim into a token).
  local scope_file scope sname sid scurrent removed removals rname rid
  while IFS= read -r scope_file; do
    [[ -n "$scope_file" ]] || continue
    scope=$(jq 'del(.removedProtocolMappers)' "$scope_file")
    removed=$(jq -c '.removedProtocolMappers // []' "$scope_file")
    sname=$(jq -r .name <<<"$scope")
    sid=$(client_scope_id "$sname")
    if [[ -z "$sid" ]]; then
      DIFFERENCES=$((DIFFERENCES + 1))
      if [[ "$MODE" == "apply" ]]; then
        api POST "/realms/$KC_REALM/client-scopes" "$scope" >/dev/null
      fi
      report "client scope $sname" "$(verb CREATE)"
      continue
    fi
    scurrent=$(api GET "/realms/$KC_REALM/client-scopes/$sid")
    changes=$(diff_json "$scope" "$scurrent" "clientScope")
    removals=$(jq -r --argjson r "$removed" '
      .protocolMappers // [] | .[] | select(.name as $n | $r | index($n))
      | "\(.name)\t\(.id)"' <<<"$scurrent")
    changes=$(printf '%s\n%s' "$changes" \
      "$(cut -f1 <<<"$removals" | sed '/^$/d' |
        sed 's/.*/clientScope.protocolMappers[&]: repository removes it, server present/')" |
      sed '/^$/d')
    if [[ -z "$changes" ]]; then
      report "client scope $sname" "in sync"
      continue
    fi
    DIFFERENCES=$((DIFFERENCES + $(wc -l <<<"$changes")))
    report "client scope $sname" "$(verb UPDATE)" "$changes"
    if [[ "$MODE" != "apply" ]]; then
      continue
    fi
    if [[ -n "$(diff_json "$(jq 'del(.protocolMappers)' <<<"$scope")" "$scurrent" clientScope)" ]]; then
      api PUT "/realms/$KC_REALM/client-scopes/$sid" \
        "$(jq --arg id "$sid" 'del(.protocolMappers) + {id: $id}' <<<"$scope")" >/dev/null
    fi
    write_mappers "/realms/$KC_REALM/client-scopes/$sid" \
      "$(jq -c '.protocolMappers // []' <<<"$scope")" "$scurrent"
    while IFS=$'\t' read -r rname rid; do
      [[ -n "$rid" ]] || continue
      api DELETE "/realms/$KC_REALM/client-scopes/$sid/protocol-mappers/models/$rid" >/dev/null
    done <<<"$removals"
  done < <(client_scope_files)

  # --- the realm's default client scopes ------------------------------------
  # What every client created from now on gets (a partner application's
  # client gets `gender` as optional this way). "Must include", see
  # without_scope_lists.
  local realm_have
  realm_have=$(jq -n \
    --argjson d "$(api GET "/realms/$KC_REALM/default-default-client-scopes" | jq -c '[.[].name]')" \
    --argjson o "$(api GET "/realms/$KC_REALM/default-optional-client-scopes" | jq -c '[.[].name]')" \
    '{default: $d, optional: $o}')
  changes=$(scope_changes "$realm_scopes" "$realm_have" \
    defaultDefaultClientScopes defaultOptionalClientScopes realm)
  if [[ -z "$changes" ]]; then
    report "realm $KC_REALM default client scopes" "in sync"
  else
    DIFFERENCES=$((DIFFERENCES + $(wc -l <<<"$changes")))
    report "realm $KC_REALM default client scopes" "$(verb UPDATE)" "$changes"
    if [[ "$MODE" == "apply" ]]; then
      apply_scope_changes "/realms/$KC_REALM" default- "$realm_scopes" "$realm_have"
    fi
  fi

  # --- clients ---------------------------------------------------------------
  local file client id uuid current settings want have scope_lines all
  while IFS= read -r file; do
    client=$(render_client "$file")
    want=$(jq -c '{default: (.defaultClientScopes // []),
                   optional: (.optionalClientScopes // [])}' <<<"$client")
    client=$(without_scope_lists <<<"$client")
    id=$(jq -r .clientId <<<"$client")
    uuid=$(client_uuid "$id")
    if [[ -z "$uuid" ]]; then
      DIFFERENCES=$((DIFFERENCES + 1))
      if [[ "$MODE" == "apply" ]]; then
        # Keycloak gives a new client the realm's default scopes; the ones
        # the file lists are added to those.
        api POST "/realms/$KC_REALM/clients" "$client" >/dev/null
        uuid=$(client_uuid "$id")
        current=$(api GET "/realms/$KC_REALM/clients/$uuid")
        apply_scope_changes "/realms/$KC_REALM/clients/$uuid" "" "$want" \
          "$(jq -c '{default: .defaultClientScopes, optional: .optionalClientScopes}' <<<"$current")"
      fi
      report "client $id" "$(verb CREATE)"
      continue
    fi
    current=$(api GET "/realms/$KC_REALM/clients/$uuid")
    have=$(jq -c '{default: (.defaultClientScopes // []),
                   optional: (.optionalClientScopes // [])}' <<<"$current")
    changes=$(diff_json "$client" "$current" "client")
    scope_lines=$(scope_changes "$want" "$have" \
      defaultClientScopes optionalClientScopes client)
    if [[ -z "$changes" && -z "$scope_lines" ]]; then
      report "client $id" "in sync"
      continue
    fi
    all=$(printf '%s\n%s' "$changes" "$scope_lines" | sed '/^$/d')
    DIFFERENCES=$((DIFFERENCES + $(wc -l <<<"$all")))
    report "client $id" "$(verb UPDATE)" "$all"
    if [[ "$MODE" != "apply" ]]; then
      continue
    fi

    if [[ -n "$changes" ]]; then
      settings=$(jq 'del(.protocolMappers)' <<<"$client")
      api PUT "/realms/$KC_REALM/clients/$uuid" "$settings" >/dev/null
      write_mappers "/realms/$KC_REALM/clients/$uuid" \
        "$(jq -c '.protocolMappers // []' <<<"$client")" "$current"
    fi
    if [[ -n "$scope_lines" ]]; then
      apply_scope_changes "/realms/$KC_REALM/clients/$uuid" "" "$want" "$have"
    fi
  done < <(client_files)
}
