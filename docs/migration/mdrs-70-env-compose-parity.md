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
| `DB_CA_CERT` + three OTLP exporter settings — four keys, seven mappings (`DB_CA_CERT` is tedrisat-only) | private-CA TLS unusable; three exporter settings inert |

A note on that third row, because the numbers matter here. MDRS-70's description
attributes the fix to commit `710b4c4` on `release/260817` and calls it "five
keys". **Neither is verifiable in this repository:** `git cat-file -t 710b4c4`
returns *"Not a valid object name"*, and `release/260817` appears in neither
`git branch -a` nor `git ls-remote origin`. The commit that actually put
`DB_CA_CERT` into `docker-compose.yml` here is `cb7e9636`
(`git log --all -S'DB_CA_CERT' -- docker-compose.yml`), the MDRS-48 squash of
twelve pull requests — which, being a squash, cannot isolate that fix either.
What *is* verifiable in the working tree is the count: one `DB_CA_CERT` mapping
plus six OTLP mappings (three settings × two services) = four distinct keys,
seven mappings. The figures written here and in the script header are those
measured ones, not the issue's narrative.

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
a key that reaches *nothing*. tedrisat's seven `API__KEYCLOAK_*` keys
legitimately do not reach teskilat — it has no auth guard, and nothing under
`apps/teskilat/src` reads a Keycloak variable — and MDRS-69 owns whether the rest
of that divergence is right. Requiring full group coverage would have turned that
documented decision into seven ignore-list entries and taught the next reader
that the ignore list is where disagreements go. (Seven, counted with
`grep -cE '^API__KEYCLOAK_' .env.example` and matching the run's own NOTE
section — an earlier draft of this record and of the script header said six.) Partial coverage is printed as a labelled
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

### Six ways the lists are stopped from rotting

1. An `UNMAPPED_ON_PURPOSE` entry whose key has left `.env.example` fails.
2. An `UNMAPPED_ON_PURPOSE` entry whose key *has since been mapped* fails, so
   an exemption cannot outlive its reason.
3. A `ROOT_ONLY_KEYS` entry that `docker-compose.yml` never interpolates
   **outside a comment** fails —
   "root-only" means compose reads it; a key neither side reads is dead and
   belongs deleted from the template, not exempted.
4. A key assigned twice in `.env.example` fails. The loader keeps the last
   assignment, so a duplicate makes the file lie to whoever searches it — and it
   would also break the count reconciliation this record relies on.
5. A prefix listed in **both** `PREFIX_TARGETS` and `UNCONTAINERISED_PREFIXES`
   fails. This was a real hole found while reviewing the script: the
   out-of-scope branch is tested first, so putting `API` in
   `UNCONTAINERISED_PREFIXES` would have skipped all 21 `API__` keys while every
   other check still reported green — the one edit that could have disabled the
   gate without anything going red.
6. A `PREFIX_TARGETS` entry with an empty target list fails — the same hole by
   another route, and it would otherwise produce a failure message naming no
   service.

`UNMAPPED_ON_PURPOSE` is honoured **only** for keys whose prefix is in
`PREFIX_TARGETS`. An earlier version accepted unprefixed keys there too, which
made a branch no green run could reach: the key was exempted at classification
time while the staleness check rejected the very same entry for having no
checkable prefix. An unprefixed key that is exempt at all is root-only by
definition, so `ROOT_ONLY_KEYS` is the only correct home for it, and the failure
message now says so.

### Fail-closed parsing

`docker-compose.yml` is read as text — the way `assert-release-config.mjs` reads
`pnpm-workspace.yaml` — rather than adding a YAML dependency for two nested
blocks. Every assertion below the parse is *negative* ("no service names this
key"), so a text parser that silently matched nothing would report a clean bill
of health on a broken repo. The parse therefore asserts its own results first
and aborts on any of: zero `.env.example` assignments, zero services, zero
`environment:` blocks, zero services with a `build:` section, **or zero
interpolated variables inside the blocks it did find**. That last one is the
guard that actually means "the parser matched nothing" — counting blocks is not
the same as reading them, and a review of this script found a case where a block
was found and walked straight past (below).

Only `environment:` counts, so a variable used in `ports:` or `volumes:` is not
mistaken for something the container receives. Comment lines are dropped before
matching, so a variable merely *named* in a comment — `docker-compose.yml` has
several — is not counted as mapped. Both `environment:` spellings are handled:
the mapping form this repo uses, and the YAML sequence form
(`- PORT=${TEDRISAT__PORT}`), whose items sit at the *same* indent as the key.

### Two holes found by review, after the first version passed its own tests

Both were measured on this branch, and both had a green run hiding them — which
is the point worth recording: the nine injections in §2 all passed against the
version that carried these bugs.

1. **A comment satisfied the `ROOT_ONLY_KEYS` anti-rot check.** It tested the raw
   file text, so a key that had been *removed* from `ports:` and left behind only
   in a `# was: ${...}` comment still counted as "read by compose" — the exact
   thing guarantee 3 promises to catch, and the one case where the parser's
   deliberate comment-stripping was not applied. Fixed by matching against the
   parsed interpolations (a new file-wide set collected from non-comment lines)
   rather than the file text. `envVars` alone could not serve here: these keys are
   read by compose's own `ports:` entries, not handed to a container.
2. **The YAML sequence form of `environment:` was silently swallowed.** Its items
   sit at indent 4, the same as a sibling key, so the branch that detects
   `ports:`/`build:` consumed them and left the block parsed-but-empty. Measured
   against the committed version: converting teskilat's block to sequence form —
   valid YAML, confirmed with `yaml.safe_load` — made five `TESKILAT__` keys
   report `→ (nothing)` and pointed the reader at `docker-compose.yml` instead of
   at the parser. Fixed by testing list items before the sibling-key branch.

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

### Fail-closed — thirteen injections, each measured

Every case below was injected on this branch, run, and reverted. Cases (a)–(i)
were run against the first version of the script; (j)–(m) close the four findings
a review of that version raised.

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

**(h) A prefix classified both ways.** Added `API` to
`UNCONTAINERISED_PREFIXES` while leaving it in `PREFIX_TARGETS`:

```
✖ no prefix is classified both ways
    in PREFIX_TARGETS and UNCONTAINERISED_PREFIXES: ["API"]
    The out-of-scope branch wins, so every key under that prefix would be skipped silently.
```

**(i) An empty target list.** Set `API: []` in `PREFIX_TARGETS`:

```
✖ every prefix target list names at least one service
    empty in PREFIX_TARGETS: ["API"]
    A prefix with no targets cannot reach anything, so its keys would fail with a message naming no service.
    Move it to UNCONTAINERISED_PREFIXES if the app has no compose service.
```

### The four review findings, re-proven after the fix

**(j) A comment must no longer satisfy the anti-rot check.** Replaced
`- "${MEDARIS_POSTGRES_PORT:-5432}:5432"` with a literal `- "5432:5432"` plus a
`# was: ${MEDARIS_POSTGRES_PORT:-5432}` comment, leaving the key dead on both
sides. **Before the fix this printed `✔ … is read by compose` and exited 0.**
After:

```
✖ ROOT_ONLY_KEYS[MEDARIS_POSTGRES_PORT] is read by compose
    docker-compose.yml never interpolates ${MEDARIS_POSTGRES_PORT} outside a comment. "Root-only" means compose reads it and hands it to no app; a key neither side reads is dead and belongs deleted from .env.example, not exempted.
```

Exit code `1`.

**(k) The YAML sequence form is now read, not swallowed.** Converted teskilat's
whole `environment:` block to sequence form (21 items; validated as a list with
`yaml.safe_load`). Against the committed version, five keys were lost:

```
✖ TESKILAT__PORT → (nothing)
✖ TESKILAT__SERVICE_NAME → (nothing)
✖ TESKILAT__DB_NAME → (nothing)
✖ TESKILAT__DB_USERNAME → (nothing)
✖ TESKILAT__DB_PASSWORD → (nothing)
```

After the fix the same file parses correctly — `✔ TESKILAT__PORT → teskilat` and
the other four — and the run stays green, which is the right answer: the mappings
are genuinely present, only written in the other form.

**(l) The blocks-found-but-not-read guard.** Replaced every `${...}` in
`docker-compose.yml` with a literal, so the three `environment:` blocks are still
found and carry nothing traceable:

```
✖ env/compose parity: parsed 3 `environment:` block(s) out of docker-compose.yml but 0 interpolated variables inside them. The blocks were found and their contents were not read, so every key would be reported as reaching nothing.
```

Exit code `1`, and it aborts before printing 33 misleading failures.

**(m) The remedy named for an unprefixed key is now the one that works.**
Appended `MEDARIS_POSTGRES_INITDB_ARGS=--data-checksums`:

```
✖ MEDARIS_POSTGRES_INITDB_ARGS → (nothing)
    ...
      * declare it — an unprefixed key that compose reads and hands to no app
        belongs in ROOT_ONLY_KEYS in this file, with the reason, in the same PR.
        (Not UNMAPPED_ON_PURPOSE: that list is for prefixed keys only.)
```

Previously the message said "add it to `UNMAPPED_ON_PURPOSE`", and following that
advice produced a *second* failure
(`✖ UNMAPPED_ON_PURPOSE[…] names a prefix this gate checks`) — `ROOT_ONLY_KEYS`
was named in no error message at all. Following the corrected advice was then
verified to reach green: mapping the key in `medaris-db` and adding a
`ROOT_ONLY_KEYS` entry gave `✔ … is read by compose` and
`✔ env/compose parity: 33 in-scope keys … 9 exempt by declaration`, with no
second failure.

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
- **The script has no unit tests**, in keeping with the other five files in
  `tools/ci/`, none of which has any either. Its behaviour is instead pinned by
  the thirteen injections in §2, each run by hand and reverted. That is weaker
  than a test suite in one specific way, and it is worth being blunt about it:
  the first version of this script passed all nine of its own original
  injections while carrying the two bugs in §1, so this evidence establishes
  that the listed cases behave correctly, not that the script is correct.
- **The parser's indentation assumptions are not exhaustively covered.** It
  expects services at two spaces and their keys at four, and now handles both
  `environment:` spellings, but a compose file reindented wholesale would abort
  on the parse guards rather than be understood. Aborting is the safe outcome;
  it is not the same as supporting the format.

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
