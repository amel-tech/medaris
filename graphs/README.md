# Medaris graphs

Medaris's [delurio](https://delur.io) graphs: what every screen and every flow of the four web apps, the Keycloak realm and the
API does, written from the code as it is (format `delurio-graph/0`, as `@delurio/cli` 0.8.0 checks it). They are meant to be
checked in CI, walked on a local stack with delurio's replay, and later to take over the web e2e tests they can carry, and to be
the source of tutorials.

A graph says what the code does, not what it should do. Where the code is wrong for its users (a missing name, a focus that is
lost, an error nobody announces, a refusal that reaches no one), the graph says so as a finding, in the flow's `ui.yaml`
`rules`; [`FINDINGS.md`](FINDINGS.md) collects them. Application code is not changed to fit a graph; where a walk of a flow fixed a finding in an app's own UI, `FINDINGS.md` says so under "Düzelenler".

## What is here

Counted by script on 16 November 2026 (flows are the `flow.yaml` files; actions, entities and invariants are the keys and items of `actions:`, `entities:` and `invariants:` in `graphs/domain/*.yaml`; needs are the items of every `needs.yaml`; scenarios are the keys of `scenarios:` in every binding file, read with the `yaml` package; findings are the distinct ids of `ui.yaml` `rules`, merged as `FINDINGS.md` says):

| What | How many |
| -- | -- |
| Flows (`flow.yaml`) | 175: 170 `captured`, 5 `proposed` (the planned ones) |
| Screens (`ui.yaml`) and their Turkish catalogs (`catalog/tr.json`) | 175 flows with a `ui.yaml` |
| Navigation graphs | 4, one per web app (`landing`, `tedris`, `nazar`, `nizam`) |
| The domain `medaris.api` | one domain over 26 files: 352 actions (329 in the code, 23 sketched for the planned flows), 64 entities, 319 invariants |
| `needs.yaml` (the product list of a flow) | 175 files, 2640 needs; 1264 missing and 545 unwalked are listed in [`needs.gaps.yaml`](needs.gaps.yaml) |
| Findings (distinct ids in `ui.yaml` `rules`) | 1326 ids; 1085 findings after merging the ids that share a root (21 high, 579 medium, 485 low), 188 rules that record what holds and are not defects, and 4 ids repeated on every page |
| Bindings (what a replay needs) | 170 flows carry a `binding.yaml`; with their variants and the four navigation bindings, 561 binding files hold 1024 scenarios |

## Layout

```
graphs/
  README.md                  this file
  FINDINGS.md                the register of findings, in Turkish
  needs.gaps.yaml            the known gaps of every needs.yaml
  delurio.baseline.sarif     the findings of `check` accepted when it was written; renewed only on purpose
  domain/                    the one domain, medaris.api, split over files; planned-*.yaml hold the planned API
  bindings/                  shared bindings (local.<app>.binding.yaml) and helpers/ (Node scripts a binding runs)
  .local/                    git-ignored: links to the stack's accounts and seed, made data, cached tokens
  common/shell/<flow>/       behaviour shared by several apps
  realm/auth/<flow>/         Keycloak's pages and libs/auth (flows only, no navigation graph)
  landing/nav/               the navigation graph of landing-web
  landing/site/<flow>/
  tedris/nav/                the navigation graph of tedris-web
  tedris/<area>/<flow>/
  nazar/nav/                 the navigation graph of nazar-web
  nazar/<area>/<flow>/
  nizam/nav/                 the navigation graph of nizam-web
  nizam/<area>/<flow>/
```

The top folder is the app a person works in; below it, the area is the part of the app, named as the app's menu names it.

| App | Areas (flows) |
|---|---|
| common | shell (2) |
| realm | auth (8) |
| landing | site (5) |
| tedris | account (5), celse (6), course (8), decks (11), discover (6), files (1), learn (6), learning (3), session (1), shell (3) |
| nazar | access (4), account (1), appeals (1), archive (2), bans (4), course (1), courseNazirs (3), courseSettings (4), courses (3), curriculum (4), decks (4), evaluation (2), files (1), homework (1), nazirs (4), notifications (1), offsite (1), pano (1), questions (1), recordings (2), roster (4), sessions (4), settings (1), shell (2), students (1) |
| nizam | account (1), applications (1), courseRequests (1), courses (10), decks (2), grants (1), home (4), hosting (1), inactive (2), kosks (5), madrasahs (5), moderation (8), nazims (4), notifications (1), partners (1), platform (2), shell (3), youtube (1) |

A flow's id is its path with dots: `graphs/tedris/course/apply/` is `tedris.course.apply`. A flow folder holds:

- `flow.yaml`: the states and transitions, with `source: <file>:<line>` on every state that is not an exit, on guarded
  transitions and on assertions; `failures`, `starts` (the flows it hands over to, with the value the other flow starts in) and
  the findings the flow touches in the descriptions.
- `ui.yaml` and `catalog/tr.json`: the screens (nodes, roles, names, focus) and the words the person sees, copied letter for
  letter from the app's own i18n files, with their keys. The three Next apps and landing show Turkish only, and the realm's pages are drawn in Turkish too (Keycloak also offers English and Arabic, which no graph
  carries yet), so there is one catalog per flow, `tr`. `rules` holds the findings and the standing rules of that screen.
- `needs.yaml`: what the product must do for this flow, from its story and the planned work, never from what the page does
  today; each need says what is `built` and what `walked` it, or what is `missing`.
- `binding.yaml`: what a replay needs to walk the flow on the local stack: the scenarios, the account that signs in, the data to
  make and remove, and locators where role and name cannot find a node. Some flows carry more files: `binding.<variant>.yaml`
  (a scenario that adds no new transition needs its own file to be walked), `locators.binding.yaml`, `enter.nav.binding.yaml`
  (enter through the navigation graph) and flow-local `*.mjs` helpers. A flow that cannot be walked has no binding.
- Generated, never written by hand: `viz/` (the pages, git-ignored); later also `anchors.lock.yaml` and `video/`.

The navigation graph of an app (`nav.yaml`) holds its pages, menus, frames, personas, facts and goals; `nav.extracted.yaml` beside
it (tedris, nazar and nizam) is what the engine's `extract` read from the code, and is not edited.

## Status

- Every flow is `captured` except the 5 planned ones, which are `proposed`: `landing.site.roadmap`, `nazar.sessions.inPersonSeats`, `nizam.moderation.decidePermanentBan`, `nizam.youtube.liveBroadcasts`, `tedris.session.registerInPerson`. A planned flow draws a
  feature that has no code yet (its `needs.yaml` says which Linear issue builds it, and its API is sketched in
  `domain/planned-*.yaml`, every entry marked as planned and carrying no `source`).
- Nothing has been walked as a whole. The walk phase (`replay --cover transitions --absent` on every binding, then fixing what the
  walk finds) has not run. What exists is smaller: the six reference flows (`realm.auth.signIn`, `tedris.course.apply`,
  `tedris.account.rolesOverview`, `nazar.pano.decideApplications`, `nizam.kosks.open`, `landing.site.contact`) and a number of the
  first flows written were replayed once on their main story while they were written, and three pilot flows
  (`tedris.learning.schedule`, `tedris.decks.create`, `tedris.account.profile`) were walked in full. A `replay:` entry in a
  `needs.yaml` names a scenario that exists in the flow's binding; it does not say that the scenario has passed. The output of
  a replay is not kept in this tree.
- `check --strict` is the only gate in CI (below). The whole tree (179 graphs: the 175 flows and the 4 navigation graphs) checks with 7 errors and 7 warnings, all in the nazar and nizam navigation graphs (menus that offer pages the person is refused, links that end in a refusal, pages nothing links to, a goal with no click path); each is a finding of the code, listed with its finding id in FINDINGS.md under "Taban çizgisine giren gezinti hataları", and goes into the baseline. No flow has an error. That a binding loads was checked with `--emit-spec`, which
  walks nothing; nothing else in the tree has been verified against the running apps.

## Commands

The format checker is `@delurio/cli`, pinned to an exact version (the Graphs workflow, `.github/workflows/graphs.yaml`, installs the same one):

```bash
# every graph, as CI does (about 8 minutes for the whole tree)
npx @delurio/cli@0.8.0 check graphs --strict --baseline graphs/delurio.baseline.sarif

# the page of one flow (written to <flow>/viz by default, git-ignored)
npx @delurio/cli@0.8.0 page graphs/tedris/course/apply --out viz

# what a change does to a flow, as markdown
npx @delurio/cli@0.8.0 diff graphs/tedris/course/apply --base origin/main
```

To check one flow quickly, copy `graphs/domain`, the flow's folder and the folders of every flow it `starts` into a scratch folder
named `graphs`, and run `check <scratch>/graphs --strict` on it (the checker finds a `starts` target by id under the nearest
folder called `graphs`). A navigation graph is checked the same way with `graphs/domain` and `graphs/<app>/nav`.

The baseline holds the findings `check` already knew when it was written. They still show, as warnings, and only an error that is
new since then fails the run. It is renewed on purpose, never to make a run green:

```bash
npx @delurio/cli@0.8.0 check graphs --format sarif --output graphs/delurio.baseline.sarif
```

Replay, `extract`, tutorials and videos are not in `@delurio/cli` 0.8.0: they belong to delurio's engine, a separate checkout of
delurio's own repository (`apps/engine`), run from there as `node src/cli.ts <command>`. The replay walks a flow with its binding
on the local stack, and it writes data (it applies to courses, makes köşks, sends e-mail), so run one at a time:

```bash
node src/cli.ts replay graphs/tedris/course/apply --bind graphs/tedris/course/apply/binding.yaml \
  [--cover transitions] [--absent] --out <dir>
node src/cli.ts replay <flow dir> --bind <binding file> --emit-spec --out <dir>   # loads the binding and writes a spec; walks nothing
node src/cli.ts extract graphs/nizam/nav --repo <checkout>                          # rewrites nav.extracted.yaml from the code
```

The engine this tree was written with carried two local fixes that are not in a release (a domain split over several files is
merged, and `{param}` routes are read as well as `:param`); a replay of this tree needs both. Always pass `--out` to `--emit-spec`:
without it the spec is written into the flow's folder.

## The stack and the bindings

A binding walks a real Medaris on this machine and nothing remote: Postgres (the repository's `docker-compose.yml`, service
`medaris-db`), Keycloak with the `medaris` realm provisioned from `config/keycloak/` (`scripts/provision local`; see its
`RUNBOOK.md`) and the Medaris login theme built from `apps/keycloak-theme`, Mailpit for the mail Keycloak, tedrisat and landing send,
the two APIs (tedrisat on 3001, teskilat on 3002) and the four web apps (tedris-web on 4000, nizam-web on 4001, nazar-web on 4002,
landing-web on 4003, each as `pnpm nx run <project>:dev`). Use `localhost`, never `127.0.0.1`: the realm's redirect URIs allow only
`localhost`. A seed creates one account per persona (`systemAdmin`, `medarisNazim`, `koskNazim`, `basmuderris`, `medreseNazir`,
`muderris`, `dersNazir`, `talebe`, `talebeMale`, `other`, the three `pending*` accounts and the eight spare applicants
`applicantA` to `applicantH`) and the data a walk starts from (two köşks, a medrese, three courses, a deck of the course and a deck
of the talebe's own), writes the accounts' addresses and passwords to a file only the owner can read and the data's ids to another,
and `graphs/.local/accounts.env` and `graphs/.local/seed.json` are links to those two files (git-ignored: no password and no id is
committed, and the replay masks every value it reads from the first). The scripts that brought the stack up and seeded it for the
writing of these graphs are not part of this tree. What a binding reads from the stack is written at the top of
[`bindings/local.base.binding.yaml`](bindings/local.base.binding.yaml), and the Node scripts that make and remove a walk's own data
(a course, a köşk, a ban, a seat, a mail check) are listed in [`bindings/helpers/README.md`](bindings/helpers/README.md); read both
before writing or walking a binding. Not walkable locally, and so marked `skip` with the reason in a binding: Bunny uploads and
playback and every file upload (the storage keys are not set, the upload routes answer 503), live meetings, back-channel logout
(it needs Valkey), the partner redirect, the switched-off public profile, and every planned flow.

## How to read a finding, a need and a gap

- **Findings.** `ui.yaml` `rules: [{ id, rule }]` records them, with `file:line` and the fix, and the flow's state or node
  descriptions name them. A rule is a finding (the code is wrong for its users) or a note (what holds, or a choice made on
  purpose); [`FINDINGS.md`](FINDINGS.md) sorts them by the harm to the person, says which ones the walk phase can fix in an app's
  own UI and which need the API, a shared library or a decision, and puts the security-relevant ones first. A finding about the
  API is also an invariant with `holds: false` and a `finding:` in the domain. The id is the inventory's where the finding was
  known, or `<FLOWSHORT>-n` for a new one.
- **Needs.** `needs.yaml` is a flow's product list: `id`, `need` (English), `drawn` (the states or nodes that draw it), then
  `built` (an action `medaris.api:<name>` or a `route: path:line`) with `walked` (an `e2e:` file with its `check`, a `test:` Vitest
  spec, or a `replay:` scenario), or `missing` (a Linear key, or `none`). Gender separation is given: kontenjan per gender, and gender
  always required, so a need that decides a seat is `missing: MDRS-284`. Parse a needs.yaml with a YAML parser after editing it: a
  colon in a plain scalar breaks it, and `check` does not read it.
- **Gaps.** [`needs.gaps.yaml`](needs.gaps.yaml) lists, per flow, the needs that are `missing` (no code, or code that does not meet
  the need) and the ones that are `unwalked` (built, and no e2e check and no replay scenario names them). It is built from the
  `needs.yaml` files by script, only shrinks, and is not read by `check`.

## Conventions

- Graph text (titles, `say`, descriptions, assertions) is English; the words a person sees are in the catalog, one file per locale
  the screen can show, copied from the app's i18n file with the key (the path under the file's root key, `common.*` as it is). Text
  an app builds in code is `composed.<Namespace>.<name>`, with its code line in the `ui.yaml` header.
- Samples are neutral, invented names; no real person. No secret is committed; a binding reads accounts and ids from `.local/`.
- The words are the app's: hoca, celse, köşk, medrese, talebe, müderris, başmüderris, ders nazırı, başnazım, Medaris nazımı. The
  partner app is called "the shared app" (ortak uygulama); no partner product is named anywhere.
- Two kinds of context variables in a `flow.yaml`: case variables (`initial: any`) pick the branch a walk takes, shown-state
  variables (a fixed `initial`) hold what the screen remembers. A `starts` hands a flow over with a quoted `given`, one `starts` to a
  transition, and the started flow declares the variable with `initial: any`.
- A `source: <file>:<line>` is a claim about the code. `check` reads graph files only, never the application's, so a line that moved
  is found by reading, not by the checker: when you change a file an app flow quotes, look for its `source:` lines.
