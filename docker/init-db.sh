#!/bin/sh
# Creates the per-app databases, roles and schema ownership that the two Nest
# APIs connect with, taking every credential from the environment rather than
# from a literal in this file (MDRS-68).
#
# Why a shell script and not the init-db.sql this replaced: the postgres image's
# docker-entrypoint.sh feeds `*.sql` files to psql verbatim and performs no
# variable substitution, so a `.sql` file cannot read the password compose was
# given. It does exec a `*.sh` file when that file is executable — measured
# against postgres:17-alpine, docker-entrypoint.sh:180-186. envsubst is not in
# that image (also measured), so templating the SQL would mean adding gettext to
# the database image or rendering the file on the host, and rendering puts the
# plaintext password into a file on disk.
#
# Why \getenv and not psql's --set: --set=password=… places the value in psql's
# argv, where anything in the container's PID namespace can read it out of
# /proc/<pid>/cmdline for the life of the call. \getenv (psql 14+) reads the
# variable from the environment psql already has, so only the variable's *name*
# appears in argv — measured both ways, side by side.
#
# What that does NOT buy: `ALTER ROLE … PASSWORD` necessarily carries the
# password in its statement text, so it is visible in pg_stat_activity while it
# runs and would appear in the server log under log_statement=ddl or higher.
# postgres:17-alpine ships log_statement=none. There is no way to set a password
# without sending it, so this is inherent, not a shortcoming of the approach.
#
# Why \gexec and not the `DO $$ ... $$` guards init-db.sql used: psql does not
# interpolate :'var' inside a dollar-quoted string, so a variable named there
# reaches the server as the literal text `:'role'`. Generating the statement with
# format() and running it through \gexec keeps the idempotency guard and gets
# %I / %L quoting from the server, which is what makes a password containing a
# quote safe rather than a syntax error. Verified against a live cluster with a
# password holding a single quote, a double quote, a backslash and a newline: it
# round-tripped intact and logged in, and an injected `ALTER ROLE … SUPERUSER`
# rode along as inert text.
#
# Runs only on an empty data directory — the entrypoint skips
# /docker-entrypoint-initdb.d once $PGDATA is non-empty. An existing
# postgres_data volume therefore keeps whatever credentials it was first created
# with, and so does one where this script failed part-way: in both cases the
# volume has to go before a retry can work. `docker compose down -v`.
set -eu

# Fail loudly and before touching the cluster. Without this the roles would be
# created with an empty password, and the failure would surface much later as the
# app's "password authentication failed" — the exact symptom MDRS-68 is about.
: "${TEDRISAT_DB_NAME:?init-db: TEDRISAT_DB_NAME is unset; docker-compose.yml must map TEDRISAT__DB_NAME}"
: "${TEDRISAT_DB_USERNAME:?init-db: TEDRISAT_DB_USERNAME is unset; docker-compose.yml must map TEDRISAT__DB_USERNAME}"
: "${TEDRISAT_DB_PASSWORD:?init-db: TEDRISAT_DB_PASSWORD is unset; set TEDRISAT__DB_PASSWORD in .env}"
: "${TESKILAT_DB_NAME:?init-db: TESKILAT_DB_NAME is unset; docker-compose.yml must map TESKILAT__DB_NAME}"
: "${TESKILAT_DB_USERNAME:?init-db: TESKILAT_DB_USERNAME is unset; docker-compose.yml must map TESKILAT__DB_USERNAME}"
: "${TESKILAT_DB_PASSWORD:?init-db: TESKILAT_DB_PASSWORD is unset; set TESKILAT__DB_PASSWORD in .env}"

# The ALTER statements below are unconditional, so a name collision does not
# error — it silently reassigns a password or an owner. The old file hardcoded
# every name and could not collide; now that they come from the environment,
# refuse each collision by name instead of letting it be discovered later as a
# mystery authentication failure.
#
# Byte-exact comparison is deliberate, not sloppy: format('%I') never folds case
# — it double-quotes anything that is not already lowercase — so `POSTGRES` and
# `postgres` really are two different roles here, and a case-insensitive check
# would refuse a pair that works.
#
# Tripping any of these leaves an INITIALISED but UNPROVISIONED volume: initdb
# has already run by the time this script does, and the entrypoint skips
# /docker-entrypoint-initdb.d entirely on a non-empty $PGDATA. So a retry after
# fixing .env needs the volume dropped first — `docker compose down -v` — or the
# cluster comes up healthy with no app roles at all.
die() {
	echo "init-db: $1" >&2
	echo "init-db: nothing was provisioned; run \`docker compose down -v\` before retrying, or the next start skips this script and leaves the cluster without app roles" >&2
	exit 1
}

for app_role in "$TEDRISAT_DB_USERNAME" "$TESKILAT_DB_USERNAME"; do
	if [ "$app_role" = "$POSTGRES_USER" ]; then
		die "app role '$app_role' is the superuser (MEDARIS_POSTGRES_USER); refusing to reset its password"
	fi
done

if [ "$TEDRISAT_DB_USERNAME" = "$TESKILAT_DB_USERNAME" ]; then
	die "TEDRISAT__DB_USERNAME and TESKILAT__DB_USERNAME are both '$TEDRISAT_DB_USERNAME'; the second would overwrite the first role's password"
fi

# The same collisions on the database axis, which are exactly as silent: a shared
# name makes the second CREATE DATABASE a no-op and then hands the first app's
# database and its public schema to the second app's role.
for app_db in "$TEDRISAT_DB_NAME" "$TESKILAT_DB_NAME"; do
	if [ "$app_db" = "$POSTGRES_DB" ]; then
		die "app database '$app_db' is the maintenance database (MEDARIS_POSTGRES_DB); refusing to reassign its ownership"
	fi
done

if [ "$TEDRISAT_DB_NAME" = "$TESKILAT_DB_NAME" ]; then
	die "TEDRISAT__DB_NAME and TESKILAT__DB_NAME are both '$TEDRISAT_DB_NAME'; the second would take ownership of the first app's database"
fi

# No `set -x` anywhere in this file, and no echo of the password variables: the
# entrypoint's output goes to the container log, which is not a secret store.
provision() {
	role="$1"
	database="$2"
	# Re-exported under one fixed name so the heredoc below can stay literal and
	# both apps can share it: \getenv takes the name of an environment variable,
	# not an expression.
	INIT_DB_PASSWORD="$3"
	export INIT_DB_PASSWORD

	printf 'init-db: provisioning database %s for role %s\n' "$database" "$role"

	psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --no-psqlrc \
		--set=ON_ERROR_STOP=1 \
		--set=role="$role" \
		--set=database="$database" <<-'SQL'
		\getenv password INIT_DB_PASSWORD

		SELECT format('CREATE ROLE %I LOGIN', :'role')
		 WHERE NOT EXISTS (
		   SELECT FROM pg_catalog.pg_roles WHERE rolname = :'role'
		 )
		\gexec

		SELECT format('ALTER ROLE %I WITH PASSWORD %L', :'role', :'password')
		\gexec

		SELECT format('CREATE DATABASE %I OWNER %I', :'database', :'role')
		 WHERE NOT EXISTS (
		   SELECT FROM pg_catalog.pg_database WHERE datname = :'database'
		 )
		\gexec

		SELECT format('ALTER DATABASE %I OWNER TO %I', :'database', :'role')
		\gexec

		SELECT format('GRANT ALL PRIVILEGES ON DATABASE %I TO %I', :'database', :'role')
		\gexec
	SQL

	unset INIT_DB_PASSWORD

	# A second connection rather than `\c`: the schema grants have to run inside
	# the new database, and reconnecting mid-script would carry the --set
	# variables but lose ON_ERROR_STOP's position in the transcript.
	psql --username "$POSTGRES_USER" --dbname "$database" --no-psqlrc \
		--set=ON_ERROR_STOP=1 \
		--set=role="$role" <<-'SQL'
		SELECT format('ALTER SCHEMA public OWNER TO %I', :'role')
		\gexec

		SELECT format('GRANT ALL ON SCHEMA public TO %I', :'role')
		\gexec
	SQL
}

provision "$TEDRISAT_DB_USERNAME" "$TEDRISAT_DB_NAME" "$TEDRISAT_DB_PASSWORD"
provision "$TESKILAT_DB_USERNAME" "$TESKILAT_DB_NAME" "$TESKILAT_DB_PASSWORD"

printf 'init-db: done\n'
