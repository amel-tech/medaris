# MDRS-68 — the compose database's credentials come from the environment

`cp .env.example .env && docker compose up` could not produce a working
tedrisat. `docker/init-db.sql` created the role with the literal password
`tedrisat`; `.env.example` told the application to connect with `change-me`. The
application therefore died in `DatabaseService.onModuleInit` with `password
authentication failed for user "tedrisat"`, and the `:?` on
`TEDRISAT__DB_PASSWORD` enforced *typing* a value rather than *choosing* one:
every value except the one hardcoded in the SQL file failed.

The fix removes the hardcoded side. It does not align `.env.example` to the
literal, which would have kept a repository-published password as the working
credential and undone what MDRS-35 did on the application side.

## What changed

| File | Change |
|---|---|
| `docker/init-db.sh` | New. Replaces `init-db.sql`; takes every credential from the environment. |
| `docker/init-db.sql` | Deleted. |
| `docker-compose.yml` | `medaris-db` is handed the same `TEDRISAT__*` / `TESKILAT__*` interpolations the app services use; `POSTGRES_PASSWORD` lost its `:-postgres` fallback; the published port binds loopback; the healthcheck no longer hardcodes `-U postgres`. |
| `.env.example` | `MEDARIS_POSTGRES_PASSWORD=change-me` instead of `postgres`; the comments describing where the app passwords are consumed were rewritten. |
| `README.md`, `docs/runbooks/deploy-tedrisat-api.md`, `apps/tedrisat/drizzle.config.ts`, `apps/tedrisat/src/config/security-env.ts` | Comment/prose references to the deleted `init-db.sql` corrected. Code unchanged in the two TypeScript files — comments only. |

`docs/migration/mdrs-34-cors-origin-validation.md` also names `init-db.sql`. It
was left alone: it is a record of what was run in August 2026, and the file did
exist then.

## Why a `.sh` file, and why `\gexec`

Both mechanics were measured against `postgres:17-alpine`, not assumed.

**`.sh` rather than a templated `.sql`.** The image's entrypoint hands `*.sql`
files to psql verbatim and substitutes nothing, so a `.sql` file cannot read the
password compose was given. It *does* exec a `*.sh` file when that file is
executable:

```
$ docker run --rm postgres:17-alpine grep -n -A14 'process_init_file' /usr/local/bin/docker-entrypoint.sh
180-			*.sh)
183-				if [ -x "$f" ]; then
184-					printf '%s: running %s\n' "$0" "$f"
185-					"$f"
```

`docker/init-db.sh` is committed mode `755` for that branch. If it ever loses the
bit the entrypoint sources it instead, which still works but would let `set -eu`
and a failing `:?` guard take down the entrypoint shell rather than one
subprocess — worth knowing, not worth guarding against.

**`envsubst` was the other candidate and is not available:**

```
$ docker run --rm postgres:17-alpine sh -c 'command -v envsubst >/dev/null && echo "HAS envsubst" || echo "NO envsubst"; command -v psql'
NO envsubst
/usr/local/bin/psql
```

Adding gettext to the database image, or rendering the template on the host,
would also mean the plaintext password lands in a file. psql's own `--set` does
not: the value is passed as a psql variable and never written anywhere.

**`\gexec` rather than the `DO $$ … $$` blocks `init-db.sql` used.** psql does
not interpolate `:'var'` inside a dollar-quoted string, so a variable named
inside a `DO` body reaches the server as the literal text `:'role'`. Generating
each statement with `format()` and running it through `\gexec` keeps the
`IF NOT EXISTS` idempotency the old file had, and gets `%I` / `%L` quoting from
the server — which is what makes a password containing a quote safe rather than a
syntax error.

## Why no new `.env` keys

`medaris-db` receives `TEDRISAT_DB_PASSWORD` etc. from the *same* interpolation
expressions the `tedrisat` service already used
(`${TEDRISAT__DB_PASSWORD:?set TEDRISAT__DB_PASSWORD in .env}`). One source, two
consumers, so the role and the connection string cannot drift apart again — and
`.env.example`'s key set is unchanged, which matters for the fail-closed
`.env.example` ⇄ compose parity gate PR #51 adds.

The password does end up in the database container's environment, visible to
`docker inspect`, exactly as `POSTGRES_PASSWORD` already was. That is not a
regression, and no other route exists for `docker-entrypoint-initdb.d`.

## Verified

Run from the worktree with a fresh volume, against Docker 29.7.2 / Compose
v5.1.0. The system daemon was addressed explicitly
(`DOCKER_HOST=unix:///var/run/docker.sock`) because the machine's selected
`desktop-linux` context points at a socket that does not exist; no context was
changed.

**1. `cp .env.example .env && docker compose up` boots tedrisat, no hand-editing.**

```
$ docker compose logs medaris-db | grep -i 'init-db\|ready to accept'
/usr/local/bin/docker-entrypoint.sh: running /docker-entrypoint-initdb.d/init-db.sh
init-db: provisioning database tedrisat_db for role tedrisat
init-db: provisioning database teskilat_db for role teskilat
init-db: done
2026-08-25 09:52:51.692 UTC [1] LOG:  database system is ready to accept connections
```

```
$ docker compose logs tedrisat | tail
Tedrisat service is running on port 3001
INFO (tedrisat-service): Migrations completed successfully
INFO (tedrisat-service): Database connected successfully
INFO (tedrisat-service): Nest application successfully started
```

```
$ docker compose ps
medaris-db	running	Up 26 seconds (healthy)
tedrisat	running	Up 21 seconds
teskilat	running	Up 21 seconds
```

**2. `/health` answers 200.**

```
$ curl -sS http://127.0.0.1:3001/health
{"status":"ok","timestamp":"2026-08-25T09:53:29.298Z","service":"tedrisat","version":"0.1.5","environment":"development"}
```

`environment: development` is correct rather than a leftover: `.env.example`
ships `API__NODE_ENV=development`, and compose's `production` fallback only
applies when the key is absent.

**3. Ownership is what the script intended.**

```
$ docker compose exec -T medaris-db psql -U postgres -Atc "SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname IN ('tedrisat','teskilat') ORDER BY 1;"
tedrisat|t
teskilat|t
$ docker compose exec -T medaris-db psql -U postgres -Atc "SELECT datname, pg_get_userbyid(datdba) FROM pg_database WHERE datname LIKE '%_db' ORDER BY 1;"
tedrisat_db|tedrisat
teskilat_db|teskilat
```

**4. The role's password really is the one in `.env` — both directions.**

A first attempt at this test connected from inside the database container over
`127.0.0.1` and succeeded with a deliberately wrong password. That is not a
missing password: the image's `pg_hba.conf` keeps initdb's
`host all all 127.0.0.1/32 trust` line and appends `host all all all
scram-sha-256`, so container-loopback is exempt and everything else is not. The
test was redone from a throwaway container on the compose network, which is the
path the application actually takes:

```
$ docker run --rm --network …_default -e PGPASSWORD=definitely-not-it postgres:17-alpine \
    psql -h medaris-db -U tedrisat -d tedrisat_db -Atc 'select current_user'
psql: error: connection to server at "medaris-db" (172.20.0.2), port 5432 failed:
FATAL:  password authentication failed for user "tedrisat"

$ docker run --rm --network …_default -e PGPASSWORD="<the TEDRISAT__DB_PASSWORD from .env>" postgres:17-alpine \
    psql -h medaris-db -U tedrisat -d tedrisat_db -Atc 'select current_user, current_database()'
tedrisat|tedrisat_db
```

The negative case reproduces MDRS-68's exact symptom, which confirms the
positive case is authentication succeeding and not authentication being skipped.

**5. Neither `docker-compose.yml` nor `docker/init-db.sh` falls back to a
published credential.** With `MEDARIS_POSTGRES_PASSWORD` removed from an
otherwise complete `.env`, compose refuses to render rather than reaching for
`postgres`:

```
$ grep -v '^MEDARIS_POSTGRES_PASSWORD=' .env > /tmp/env && docker compose --env-file /tmp/env config --quiet
error while interpolating services.medaris-db.environment.POSTGRES_PASSWORD: required variable MEDARIS_POSTGRES_PASSWORD is missing a value: set MEDARIS_POSTGRES_PASSWORD in .env
```

The remaining defaults in that service — `MEDARIS_POSTGRES_USER=postgres`,
`MEDARIS_POSTGRES_DB=postgres`, and the two `DB_USERNAME`s — are identifiers, not
credentials.

`.env.example` still carries a value for every required key, because AC 1 needs
`cp` then `up` to work with no editing. Those values are the repository's
existing placeholder convention (`change-me`), which is what the two app
passwords already shipped; the template is the one place an operator is told to
edit.

**6. Teardown leaves no volume.** The init script runs on an empty data
directory only, so a volume created under the old hardcoded password would keep
that role and make the next run falsely green:

```
$ docker compose down -v
Volume mdrs-68-init-db-env-credentials_postgres_data Removed
$ docker volume ls | grep -c mdrs-68
0
```

This is now stated in `.env.example` next to all three passwords and in
`README.md`: changing a password after the first `up` requires
`docker compose down -v`.

**7. Gate**, measured on this branch, `--skip-nx-cache` throughout:

| Target | Result |
|---|---|
| `typecheck` | 16 projects + 2 dependent tasks, success |
| `test` | 3 projects, success — 226 tests / 17 files |
| `build` | 8 projects, success |
| `lint` | 16 projects, success |
| `module-boundaries` | 16 projects, success |

The `test` row is worth spelling out, because `CLAUDE.md` still says
"**91 tests / 10 suites**" and that number no longer describes `main`. Measured
here with `--output-style=stream`: tedrisat 224 tests / 15 files, teskilat 2 / 2,
and `tedris-web:test` is a stub that echoes "Tests not implemented" — three
projects carry a `test` target (`nx show projects --with-target test`), and
`common` is not one of them. Nothing in this branch changed a test; the count was
already 226 at `cb7e9636`. Correcting `CLAUDE.md` is left to whoever owns it
rather than smuggled into a credentials change.

Neither of the two flaky targets reported for the previous session
(`tedrisat:test` via Testcontainers, `tedrisat:typecheck` racing `common:build`'s
`rimraf dist`) failed here; `test` was run four times in total while collecting
these counts and passed every time.

## Not verified

- **Coolify / any non-compose deployment.** Those databases are provisioned
  outside this repository and never ran `init-db.sql`, so nothing here reaches
  them; the runbook row was corrected but not re-tested against the platform.
- **A password containing a quote or a backslash.** The `%L` quoting is what
  makes that safe and is server-side, but only the `.env.example` placeholder was
  actually run through the script.
- **`POSTGRES_USER` set to something other than `postgres`.** The healthcheck was
  changed so this case can work at all; the interpolation was verified in
  `docker compose config` output (`pg_isready -U postgres -d postgres`), not by
  booting with a renamed superuser.
- **teskilat against its database.** teskilat opens no database connection
  (`docker-compose.yml` says so, and it has no `DB_CA_CERT`), so its role and
  database were verified to exist and to authenticate, but no application traffic
  exercised them.

## Follow-ups (not opened as issues)

- `apps/teskilat/src/config/config.ts` still falls back to the literal
  `"password"` when `TESKILAT__DB_PASSWORD` is unset — `.env.example` says so at
  the key. Under compose that fallback is now unreachable (`:?` on both the app
  and the database), but it remains reachable under `pnpm dev`. This is the half
  of MDRS-35 that was never done, and it belongs to whoever finishes it, not
  here.
- `docker compose logs tedrisat` prints `Database connected successfully` five
  times on one boot. Pre-existing and unrelated to credentials, but it suggests
  `DatabaseService.onModuleInit` runs once per importing module.
- PR #51's parity-gate ignore list justifies `MEDARIS_POSTGRES_*` with the words
  "docker/init-db.sql creates the per-app users". The rationale still holds — the
  keys are root-only and reach no app — but the filename in it is now stale.
