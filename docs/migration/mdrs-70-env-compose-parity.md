# MDRS-70 — a gate for keys `.env.example` ships that no container can receive

Since MDRS-25 replaced compose's `env_file:` with an explicit `environment:`
allowlist, a key that `docker-compose.yml` does not name cannot reach a
container by any route. Setting it in the root `.env` still changes
`nx run <api>:dev`, so dev and deployment disagree — quietly, and only about the
keys someone forgot to map.

Three such divergences shipped in one integration, and all three were found by
reading the two files side by side, none by a gate:

| What | Consequence |
| --- | --- |
| MDRS-30's Keycloak keys | boot failure |
| `KEYCLOAK_CACHE_TTL` / `KEYCLOAK_NOT_FOUND_CACHE_TTL` | template asks for 1 h; code default of 24 h applied instead, so a rotated realm key stayed trusted for a day |
| `DB_CA_CERT` + three OTLP exporter settings (fixed on `release/260817`, commit `710b4c4`) | private-CA TLS unusable; three exporter settings inert |

## 1 — What was added

`tools/ci/assert-env-compose-parity.mjs`, following
`assert-release-config.mjs` and `assert-traceability.mjs`: same argument
handling (none — it reads the two files off the repo root), same `✔`/`✖` output
shape, same exit-code contract (`0` clean, `1` on any failure), same habit of
saying which side to fix.

Wired the same way as its siblings:

- `package.json` → `"assert:env-compose-parity": "node tools/ci/assert-env-compose-parity.mjs"`
- `.github/workflows/ci.yaml` → a step in the `verify` job, immediately after
  `Assert release config consistency`. That is the same trigger the other
  `tools/ci` assertions run on: `pull_request` against `main`/`dev`, `push` to
  `main`, and `workflow_dispatch` (AC #3).

### The rule

A key whose prefix names a compose service must be interpolated inside that
service's `environment:` block, or be declared with a reason.

`API__` is a *group* prefix, and the bar for it is **reaches at least one
target**, not all of them. That is deliberate: the class this issue describes is
a key that reaches *nothing*. tedrisat's six `KEYCLOAK_*` keys legitimately do
not reach teskilat — it has no auth guard, and nothing under `apps/teskilat/src`
reads a Keycloak variable — and MDRS-69 owns whether the rest of that divergence
is right. Requiring full group coverage would have turned that documented
decision into six ignore-list entries and taught the next reader that the ignore
list is where disagreements go. Partial coverage is printed as a labelled
**NOTE** instead, so it stays visible without being a failure.

### The declared lists (AC #2)

Nothing is skipped by pattern; every exemption is a named entry with a stated
reason, and the script **prints all of them with their reasons and a count on
every run** so the list cannot grow unnoticed.

`UNMAPPED_ON_PURPOSE` — in-scope keys that deliberately reach no container. Two
entries:

- `API__DB_HOST` — compose pins `DB_HOST: medaris-db`, the service name the
  database answers on inside the compose network. The template's `localhost` is
  only ever correct for `nx run <api>:dev`.
- `API__AUTO_MIGRATIONS_FOLDER` — compose pins
  `./dist/src/database/migrations`. The template names `./src/...` for
  `nest start`; the image runs compiled output.

`ROOT_ONLY_KEYS` — six unprefixed keys read by compose itself and handed to no
app: `TEDRISAT_PORT`, `TESKILAT_PORT`, `MEDARIS_POSTGRES_{USER,PASSWORD,DB,PORT}`.
Needed because the template's own header reads a bare `KEY=` as "every app",
which would otherwise make these fail for a reason nobody could act on.

`UNCONTAINERISED_PREFIXES` — `WEB__`, `TEDRIS__`, `NIZAM__`, `NAZIR__`,
`LANDING__`. Not exemptions: `docker-compose.yml` builds only the two Nest APIs
and the database, so there is no container on the other side to compare against.
They are still *listed* rather than pattern-skipped, so a prefix nobody has
classified fails instead of vanishing into a default branch — this is the
escape route that would otherwise make the whole gate optional.

### Three ways the lists are stopped from rotting

1. An `UNMAPPED_ON_PURPOSE` entry whose key has left `.env.example` fails.
2. An `UNMAPPED_ON_PURPOSE` entry whose key *has since been mapped* fails, so
   an exemption cannot outlive its reason.
3. A `ROOT_ONLY_KEYS` entry that `docker-compose.yml` never interpolates fails —
   "root-only" means compose reads it; a key neither side reads is dead and
   belongs deleted from the template, not exempted.
4. A key assigned twice in `.env.example` fails. The loader keeps the last
   assignment, so a duplicate makes the file lie to whoever searches it — and it
   would also break the count reconciliation this record relies on.

### Fail-closed parsing

`docker-compose.yml` is read as text — the way `assert-release-config.mjs` reads
`pnpm-workspace.yaml` — rather than adding a YAML dependency for two nested
blocks. Every assertion below the parse is *negative* ("no service names this
key"), so a text parser that silently matched nothing would report a clean bill
of health on a broken repo. The parse therefore asserts its own results first
and aborts on any of: zero `.env.example` assignments, zero services, zero
`environment:` blocks, zero services with a `build:` section.

Only `environment:` counts, so a variable used in `ports:` or `volumes:` is not
mistaken for something the container receives. Comment lines are dropped before
matching, so a variable merely *named* in a comment — `docker-compose.yml` has
several — is not counted as mapped.

## 2 — What was verified

All output below is from this branch. Command: `node tools/ci/assert-env-compose-parity.mjs`.

### Clean tree — green, and the counts reconcile

```
  docker-compose.yml: 3 services (2 built here), 3 with an environment block
  .env.example: 71 keys shipped
  ...
✔ env/compose parity: 33 in-scope keys all reach a container; 8 exempt by declaration, 30 out of scope.
```

33 + 8 + 30 = 71, matching the 71 keys parsed. Exit code `0`.

The 33 in-scope keys break down as 21 `API__` + 7 `TEDRISAT__` + 5
`TESKILAT__`, counted from the run's own `✔` lines. The `NOTE` section reports
the 7 `API__KEYCLOAK_*` keys reaching tedrisat but not teskilat.

### Fail-closed — five injections, each measured

Every case below was injected on this branch, run, and reverted with
`git checkout --`.

**(a) AC #1 — a new `API__` key with no compose mapping.** Appended
`API__NEW_FEATURE_FLAG=true` to `.env.example`:

```
✖ API__NEW_FEATURE_FLAG → (nothing)
    .env.example ships API__NEW_FEATURE_FLAG, but no `environment:` entry in tedrisat or teskilat interpolates ${API__NEW_FEATURE_FLAG...}.
    Under `nx run <api>:dev` the loader strips the prefix and the app sees NEW_FEATURE_FLAG; in a container it sees nothing. Fix one side:
      * map it — add the canonical name to that service's environment: block in
        docker-compose.yml, e.g. `NAME: ${API__NEW_FEATURE_FLAG:-<default>}`; or
      * declare it — if the key is deliberately dev-only or root-only, add it to
        UNMAPPED_ON_PURPOSE in this file with the reason, in the same PR.
```

Exit code `1`.

**(b) AC #4 — then mapping it.** Added
`NEW_FEATURE_FLAG: ${TEDRISAT__NEW_FEATURE_FLAG:-${API__NEW_FEATURE_FLAG:-false}}`
to tedrisat's `environment:` block:

```
✔ API__NEW_FEATURE_FLAG → tedrisat
✔ env/compose parity: 34 in-scope keys all reach a container; 8 exempt by declaration, 30 out of scope.
```

Exit code `0`. The add-fail-map-pass loop of AC #4 is closed.

**(c) The historical bug, reproduced.** Deleted the `KEYCLOAK_CACHE_TTL` line
from `docker-compose.yml` — restoring the exact state that gave a 24-hour
stale-key window:

```
✖ API__KEYCLOAK_CACHE_TTL → (nothing)
    .env.example ships API__KEYCLOAK_CACHE_TTL, but no `environment:` entry in tedrisat or teskilat interpolates ${API__KEYCLOAK_CACHE_TTL...}.
```

The gate catches the regression that motivated the issue.

**(d) A stale exemption.** Changed `DB_HOST: medaris-db` to
`DB_HOST: ${API__DB_HOST:-medaris-db}`, making the `UNMAPPED_ON_PURPOSE` entry
untrue:

```
✖ UNMAPPED_ON_PURPOSE[API__DB_HOST] is still unmapped
    API__DB_HOST now reaches tedrisat, teskilat. The exemption is obsolete: remove it so the key is checked like every other one.
```

**(e) An unclassified prefix.** Appended `MUHASEBE__PORT=3003`:

```
✖ every prefix in the template is classified
    unclassified: ["MUHASEBE"]
    A prefix belongs in PREFIX_TARGETS (it names compose services) or in
    UNCONTAINERISED_PREFIXES (it names an app compose does not build).
    Until it is in one of them, nothing checks its keys.
```

**(f) The parser itself.** Renamed every `environment:` to `env:`:

```
✖ env/compose parity: parsed 0 `environment:` blocks out of docker-compose.yml's 3 service(s). Every key would look unmapped — or, if the comparison were ever inverted, every key would look mapped.
```

Exit code `1` — it aborts rather than reporting 33 vacuous passes.

**(g) A duplicate assignment.** Appended a second `API__LOG_LEVEL=debug`:

```
✖ .env.example assigns every key once
    assigned more than once: ["API__LOG_LEVEL"]
    The loader keeps the LAST assignment, so the value a reader finds by
    searching the file is not necessarily the one that applies.
```

Keys are deduplicated before anything counts them, so the
`in scope + exempt + out of scope = keys shipped` arithmetic above stays sound;
the duplicate is reported rather than absorbed. `.env.example` has no duplicates
today (`grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' .env.example | sort | uniq -d`
returns nothing).

### Repo gate

`.github/workflows/ci.yaml` parses after the edit (`yaml.safe_load`, jobs:
`commit-hygiene`, `verify`, `security`).

Full gate results are in the pull request body.

## 3 — What was NOT verified

- **The CI step has not been observed running.** It is wired into the `verify`
  job on the same trigger as its siblings and the workflow parses, but this
  record was written before the PR's first CI run. Read the run, not this line.
- **No container was started.** `docker compose config` was not run, and no
  image was built; the two files were compared as text. The claim proven here is
  "the template ships no key the allowlist omits", not "the containers boot".
- **Whether each mapped canonical name is the one the app reads.** Out of scope
  and explicitly documented as such in the script header — `SWAGGER_PATH`
  reached teskilat for months under a name its config does not use (it reads
  `SWAGGER_ENDPOINT`). Both sides were spelled correctly; they meant different
  things. Catching that needs the app's config schema, not these two files.

## 4 — Follow-ups (not opened as issues)

1. **The reverse direction is unchecked** — a key `docker-compose.yml` names
   that `.env.example` does not ship. It fails far more loudly (compose falls
   back to the `:-default` written next to it, or a `:?` key refuses to render
   and names the variable), which is why it was left out of a gate about *quiet*
   disagreement. Worth adding when someone wants the template to be an
   exhaustive index of what a container reads.
2. **Canonical-name verification** — the `SWAGGER_PATH`/`SWAGGER_ENDPOINT` class
   above. Needs each app's config schema as a third input.
3. **The four Next apps have no compose service at all**, so `WEB__` and the
   four app prefixes (30 of the 71 keys) are structurally out of scope. If the
   web apps are ever containerised, move those prefixes from
   `UNCONTAINERISED_PREFIXES` into `PREFIX_TARGETS` in the same PR — the gate
   fails on an unclassified prefix but cannot tell that a classified one has
   become wrong.
4. **The 7 `API__KEYCLOAK_*` keys reach tedrisat only.** Reported as a NOTE, not
   a failure; MDRS-69 owns whether teskilat's remaining DB/auth assumptions
   should follow `KEYCLOAK_JWKS_URL` out of its `environment:` block.
