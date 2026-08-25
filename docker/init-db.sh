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
# the database image or rendering the file on the host, and both put the
# plaintext password into a file on disk. psql's own --set does not: the value
# goes over the wire as a query parameter substitution and never lands anywhere.
#
# Why \gexec and not the `DO $$ ... $$` guards init-db.sql used: psql does not
# interpolate :'var' inside a dollar-quoted string, so a variable named there
# reaches the server as the literal text `:'role'`. Generating the statement with
# format() and running it through \gexec keeps the idempotency guard and gets
# %I / %L quoting from the server, which is what makes a password containing a
# quote safe rather than a syntax error.
#
# Runs only on an empty data directory. An existing postgres_data volume keeps
# whatever credentials it was first created with, so after changing a password in
# .env the volume has to go: `docker compose down -v`.
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

# No `set -x` anywhere in this file, and no echo of the password variables: the
# entrypoint's output goes to the container log, which is not a secret store.
provision() {
	role="$1"
	password="$2"
	database="$3"

	printf 'init-db: provisioning database %s for role %s\n' "$database" "$role"

	psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --no-psqlrc \
		--set=ON_ERROR_STOP=1 \
		--set=role="$role" \
		--set=password="$password" \
		--set=database="$database" <<-'SQL'
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

provision "$TEDRISAT_DB_USERNAME" "$TEDRISAT_DB_PASSWORD" "$TEDRISAT_DB_NAME"
provision "$TESKILAT_DB_USERNAME" "$TESKILAT_DB_PASSWORD" "$TESKILAT_DB_NAME"

printf 'init-db: done\n'
