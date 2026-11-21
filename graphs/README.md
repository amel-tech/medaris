# Medaris graphs

Medaris's [delurio](https://delur.io) graphs: what every screen and every flow of the four web apps, the Keycloak realm and the
API does, written from the code as it is (format `delurio-graph/0`, as `@delurio/cli` 0.13.0 checks it). They are meant to be
checked in CI, walked on a local stack with delurio's replay, and later to take over the web e2e tests they can carry, and to be
the source of tutorials.

A graph says what the code does, not what it should do. Where the code is wrong for its users (a missing name, a focus that is
lost, an error nobody announces, a refusal that reaches no one), the graph says so as a finding, in the flow's `ui.yaml`
`rules`; [`FINDINGS.md`](FINDINGS.md) collects them. Application code is not changed to fit a graph; where a walk of a flow fixed a finding in an app's own UI, `FINDINGS.md` says so under "Düzelenler". The three pilot walks' fixes are not on this branch yet: their code and their graphs come with the walk phase's first commit, and until then those six findings are open here.

## What is here

Counted by script on 16 November 2026, and the flows and the needs again on 21 November 2026 after the online exams were added (flows are the `flow.yaml` files; actions, entities and invariants are the keys and items of `actions:`, `entities:` and `invariants:` in `graphs/domain/*.yaml`; needs are the items of every `needs.yaml`; scenarios are the keys of `scenarios:` in every binding file, read with the `yaml` package; findings are the distinct ids of `ui.yaml` `rules`, merged as `FINDINGS.md` says):

| What | How many |
| -- | -- |
| Flows (`flow.yaml`) | 183: 170 `captured`, 13 `proposed` (the planned ones, each drawn with its screens: 5, and the 8 of online exams) |
| Screens (`ui.yaml`) and their Turkish catalogs (`catalog/tr.json`) | every flow, 183 |
| Navigation graphs | 4, one per web app (`landing`, `tedris`, `nazar`, `nizam`) |
| The domain `medaris.api` | one domain over 27 files: 380 actions (329 in the code, 51 sketched for the planned flows, 28 of them for online exams), 74 entities, 326 invariants |
| `needs.yaml` (the product list of a flow) | 183 files, 2750 needs: 1373 met, 1377 missing (the gaps, listed in [`needs.gaps.yaml`](needs.gaps.yaml)); 583 of the met needs are walked by no scenario and no browser e2e test |
| Findings (distinct ids in `ui.yaml` `rules`, counted on 16 November 2026, before the screens of online exams, whose rules are proposals) | 1326 ids; 1085 findings after merging the ids that share a root (21 high, 579 medium, 485 low), 188 rules that record what holds and are not defects, and 4 ids repeated on every page |
| Bindings (what a replay needs) | 170 flows carry a `binding.yaml`; with their variants and the four navigation bindings, 561 binding files hold 1024 scenarios |

## Layout

```
graphs/
  README.md                  this file
  FINDINGS.md                the register of findings, in Turkish
  needs.gaps.yaml            every need that is missing, by flow (SPEC.md §13)
  delurio.baseline.sarif     the findings of `check` accepted when it was written; renewed only on purpose
  kit/                       the Medaris kit: how the pages and videos draw a screen (tokens, CSS, a template per component)
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
  today; each need names its `evidence` (the code, a test, a scenario, the states and nodes that draw it), or says why it is
  `missing`.
- `binding.yaml`: what a replay needs to walk the flow on the local stack: the scenarios, the account that signs in, the data to
  make and remove, and locators where role and name cannot find a node. Some flows carry more files: `binding.<variant>.yaml`
  (a scenario that adds no new transition needs its own file to be walked), `locators.binding.yaml`, `enter.nav.binding.yaml`
  (enter through the navigation graph) and flow-local `*.mjs` helpers. A flow that cannot be walked has no binding.
- Generated, never written by hand: `viz/` (the pages, git-ignored); later also `anchors.lock.yaml` and `video/`.

The navigation graph of an app (`nav.yaml`) holds its pages, menus, frames, personas, facts and goals; `nav.extracted.yaml` beside
it (tedris, nazar and nizam) is what the engine's `extract` read from the code, and is not edited. They were last extracted on
16 November 2026 by the engine at delurio's main (04c6a9f9), which writes every anchor from the repository root and finds the links
a page draws as well as its menus. Where it reads a link but not the condition the code draws it under, or finds a control a
hand-written entry already carries, `nav.yaml`'s `extract.entries` lays the condition over the generated entry or leaves it out
(`skip`), each with the line of code that decides it.

Every `ui.yaml` names the Medaris kit (`kit: ../../../kit`), so the pages `page` writes and the videos drawn from the
graphs show Medaris screens: the paper ground, the ink text, the lâciverd links and the `.mds-*` components, light and
dark. `kit.yaml` holds a template per component and per role, written by hand with the classes the apps ship
(`libs/ui/src/mds`). `tokens.json`, `dark.json` and `kit.css` are generated from `libs/tokens/medaris.css` and
`libs/ui/src/styles/mds/` by `node tools/graphs/build-kit.mjs`: run it after a change to either, from the repository root.
A kit fetches nothing, so the fonts the apps load (Instrument Sans, Literata) show only where the machine that draws has
them installed; elsewhere the stacks' system fallbacks do. The engine's `kit check` draws every screen with the kit and
checks that each node keeps the role, the name and the state the graph expects:

```bash
node src/cli.ts kit check $(ls <checkout>/graphs/*/*/*/ui.yaml | xargs -n1 dirname) --strict   # in the engine's checkout
```

## Status

- Every flow is `captured` except the 13 planned ones, which are `proposed`: `landing.site.roadmap`, `nazar.sessions.inPersonSeats`, `nizam.moderation.decidePermanentBan`, `nizam.youtube.liveBroadcasts`, `tedris.session.registerInPerson`, and the eight of online exams. A planned flow draws a
  feature that has no code yet (its `needs.yaml` says which Linear issue builds it, and its API is sketched in
  `domain/planned-*.yaml`, every entry marked as planned and carrying no `source`).
- **Online exams** (MDRS-299, planned on 21 November 2026) were written needs first and then drawn: `tedris.exams.mine`,
  `tedris.exams.take` and `tedris.exams.result` for the talebe, `nazar.exams.mine`, `nazar.exams.edit`, `nazar.exams.publish` and
  `nazar.exams.results` for the course team, `nizam.exams.zerothAnswers` for Medaris management; 110 needs, all missing. Each
  `flow.yaml` quotes the owner's rules and his answers of that day at its top, and each flow has its screens and Turkish catalog.
  Their API is `domain/planned-exams.yaml`: a third exam format, `MULTIPLE_CHOICE` ("Çoktan seçmeli", not "Çevrimiçi", which the
  session plan already says of an exam's place), with proposed routes, codes and two proposed permissions, `exam.prepare` and
  `exam.zeroth_read`. Two choices are still open, both to be asked again of those who asked for exams, with the flows' videos:
  whether a switch to another tab starts the exam again (`tedris.exams.take` D1), and when a talebe may start it
  (`nazar.exams.publish` D1). The hadith's Arabic and meaning in the zeroth question are for the owner to confirm. The menus'
  "Sınavlarım" entries are drawn in the flows, not in the navigation graphs, which are read from the code. No binding: nothing
  can be walked before there is code.
- Nothing has been walked as a whole. The walk phase (`replay --cover transitions --absent` on every binding, then fixing what the
  walk finds) has not run. What exists is smaller: the six reference flows (`realm.auth.signIn`, `tedris.course.apply`,
  `tedris.account.rolesOverview`, `nazar.pano.decideApplications`, `nizam.kosks.open`, `landing.site.contact`) and a number of the
  first flows written were replayed once on their main story while they were written, and three pilot flows
  (`tedris.learning.schedule`, `tedris.decks.create`, `tedris.account.profile`) were walked in full. A `scenario` in a
  `needs.yaml` names a scenario that exists in a binding of the flow (`check` resolves it); it does not say that the scenario has
  passed. The output of a replay is not kept in this tree.
- `check --strict` is the only gate in CI (below). With `@delurio/cli` 0.13.0 the whole tree (187 graphs: the 183 flows and the 4 navigation graphs) checks with 7 errors and 7 warnings in a checkout where `pnpm install` has run (run on 21 November 2026), all of them in the nazar and nizam navigation graphs (menus that offer pages the person is refused, links that end in a refusal, pages nothing links to, a goal with no click path); each is a finding of the code, listed with its finding id in FINDINGS.md under "Taban çizgisine giren gezinti hataları", and the errors are in the baseline. CI installs nothing of the repository, so there two more warnings are `citation-unresolved`: `nazar.decks.import` and `nazar.shell.errorStates` cite files of `next` under `apps/nazar/node_modules`. The 31 controls that have no WAI-ARIA role of their own (an `<input>` of type `date`, `time`, `datetime-local` or `file`, and the `<summary>` of a `<details>`) say which they are with `native` in `ui.yaml` instead of a `role`, which would claim one the browser does not expose; with 0.13.0 each was a `role-missing` warning. No flow has an error. That a binding loads was checked with `--emit-spec`, which
  walks nothing; nothing else in the tree has been verified against the running apps.

## Commands

The format checker is `@delurio/cli`, pinned to an exact version (the Graphs workflow, `.github/workflows/graphs.yaml`, installs the same one):

```bash
# every graph, as CI does (about 50 seconds and 380 MB for the whole tree); run it at the repository root, which the
# anchors and the evidence of needs.yaml are relative to
npx @delurio/cli@0.13.0 check graphs --strict --baseline graphs/delurio.baseline.sarif

# the page of one flow (written to <flow>/viz by default, git-ignored)
npx @delurio/cli@0.13.0 page graphs/tedris/course/apply --out viz

# what a change does to a flow, as markdown
npx @delurio/cli@0.13.0 diff graphs/tedris/course/apply --base origin/main

# which graphs a change touches, each with why (its own files, a `source:` anchor, a binding it extends or enters through, a
# shared catalog); a changed file of graphs/ that belongs to no graph, such as this README, touches every graph. CI does not use it
npx @delurio/cli@0.13.0 affected --base origin/main
```

Since 0.11.0 the CLI is a native program. Its npm package asks for Node 26 or later (`engines`), where the repository's `.nvmrc`
says 24, so CI runs it on 26. On Node 24 npm warns, and one flow checked there on 21 November 2026 gave the same output as on 26;
that is all that was tried. The same command is also a single binary, `delurio-v0.13.0-<platform>` on the GitHub release `v0.13.0`
of `delurio-labs/delurio`, with `SHA256SUMS`, which needs no Node.

To check one flow quickly, copy `graphs/domain`, the flow's folder and the folders of every flow it `starts` into a scratch folder
named `graphs`, and run `check <scratch>/graphs --strict` on it (the checker finds a `starts` target by id under the nearest
folder called `graphs`). A navigation graph is checked the same way with `graphs/domain` and `graphs/<app>/nav`.

The baseline holds the findings `check` already knew when it was written. They still show, as warnings, and only an error that is
new since then fails the run. It is renewed on purpose, never to make a run green:

```bash
npx @delurio/cli@0.13.0 check graphs --format sarif --output graphs/delurio.baseline.sarif
```

Replay, `extract`, tutorials and videos are not in `@delurio/cli` 0.13.0: they belong to delurio's engine, a separate checkout of
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
- **Needs** (SPEC.md §13 of `@delurio/cli`). `needs.yaml` is a flow's product list: `id`, `need` (English, from the users' side),
  then `evidence`: the `state`s and `node`s that draw it, and what shows that it exists, a `source: path:line` (the code; an API
  action is cited at its route decorator), a `test:` file with the test's `name` (a browser e2e test, a Vitest spec or an API e2e
  spec), or a `scenario` of a binding (with `binding:` when it is not the flow's `binding.yaml`). A met need names at least one
  `source`, `test` or `scenario`. A need that is not met yet says why in `missing`: the Linear issue first where there is one, then
  the finding ids of the flow's `rules`. Gender separation is given: kontenjan per gender, and gender always required, so a need that
  decides a seat is `missing: MDRS-284`. `check` resolves every piece of evidence (the file, the line, the test's name, the
  scenario, the state, the node), so evidence that goes away fails the check: deleting a web e2e test that a need names fails it
  until the need names the scenario that walks it instead. A replay leaves out the states and nodes that only
  missing needs name. The files were moved to this shape from the 0.8.0 one (`drawn`, `built`, `walked`) by script on 16 November
  2026; the writers' notes of the old shape are kept as comments at the top of each file, and the comments they left beside a need
  are in its `note`.
- **Gaps.** [`needs.gaps.yaml`](needs.gaps.yaml) lists, per flow, the ids of the needs that are `missing`. `check` holds it to the
  needs: a missing need that is not listed fails (`need-unlisted`), and so does an entry whose need is met (`gap-met`), so the list
  only shrinks, and each new gap is a line a review reads. A met need that no walk covers is not a gap: it is a need whose
  evidence names no `scenario` and no browser e2e test (`apps/*/e2e/*.e2e.ts`); there are 583.

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
- A `source: <file>:<line>` is a claim about the code. `check` holds every anchor to the code, read from the repository root: the
  file must be there and the line inside it (`source-unresolved`, an error), and a `path:line` cited in a graph's words likewise
  (`citation-unresolved`, a warning). It does not read what the line says, so a line that moved inside its file is found by
  reading, not by the checker: when you change a file an app flow quotes, look for its `source:` lines.
- A binding is held to `binding.schema.json` of the CLI (rule `schema`), so a misspelt key or a value of the wrong kind fails the
  check before any walk. Since 0.13.0 that is every binding: `binding.yaml`, a shared `<name>.binding.yaml` and the 271 variants
  `binding.<variant>.yaml`. A locator's `nth` counts from 0, or from the end when it is negative: `nth: -1` is the last of what the
  rest of the locator finds, such as the week or the celse a step has just added.
