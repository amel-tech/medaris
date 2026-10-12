#!/usr/bin/env bash
# Runs one of deploy/signoz's compose files locally, the way Coolify does:
# Coolify deletes its own keys (`exclude_from_hc`, `is_directory`) before it
# calls `docker compose`, and plain Docker Compose rejects them. Bind sources
# resolve against deploy/signoz, as they do against the base directory on the
# server.
#
#   deploy/signoz/local/compose.sh docker-compose.coolify.yaml up -d
#   deploy/signoz/local/compose.sh docker-compose.coolify.yaml ps
#
# The project name defaults to `signoz`; the volumes carry fixed names
# (signoz-clickhouse, ...), so every file here reuses the same data.
set -euo pipefail

dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
file="${1:?usage: compose.sh <compose file in deploy/signoz> <docker compose args...>}"
shift

sed -E '/^[[:space:]]+(exclude_from_hc|is_directory):[[:space:]]*true[[:space:]]*$/d' "$dir/$file" |
  docker compose --project-directory "$dir" -p "${COMPOSE_PROJECT_NAME:-signoz}" -f - -f "$dir/local/ui-port.yaml" "$@"
