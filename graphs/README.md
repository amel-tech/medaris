# Medaris, as a delurio graph

The flows, screens, API and navigation of Medaris written as one graph in [delurio-graph/0](https://github.com/delurio-labs/delurio/blob/main/SPEC.md), as the code stood at `ce47fce8` (25 Oct 2026). It is a capture: it says what the code does today, not what the PRD wants. Every state, transition, guard and endpoint carries `source: <path>:<line>`. Where an invariant one would expect does not hold, the flow models the code, and the violating path is a finding in the area's `REPORT.md`. [`FINDINGS.md`](FINDINGS.md) collects them.

Every file is `status: proposed` until a person has read it.

| Folder | What it covers | Flows |
|---|---|---|
| `nav/` | the pages, menus and who may open which page, in nazar, nizam, tedris and landing (`nav.extracted.yaml` is generated from the app source; `nav.yaml` is the hand-written half) | 4 navigation graphs |
| `auth-account/` | Keycloak screens, signing in to each portal, sessions and sign-out, the account page, platform policy, inactive scopes, Medaris nazımı grants | 12 |
| `learning/` | enrolling and leaving, the celse page and its lock, homework, questions, notes, the calendar feed, enrollment through a partner application | 9 |
| `live-media/` | the stream link, recording links and Bunny uploads, encoding and release, the watch page, hosting rights | 7 |
| `madrasah-staff/` | opening a course, course requests, medrese and course nazırs, planning celseler, curriculum, enrollment review, bulk-adding talebe | 10 |
| `kosk-decks/` | köşk applications and lifecycle, grants, decks: authoring, publishing, review, browsing, study, course decks | 11 |
| `platform-admin/` | bans and their notifications, archive, partner applications and codes, notifications, the audit log, platform settings | 10 |

Each area's API is `<area>/domain/domain.yaml` (fields as JSON Schema, actions with a route as OpenAPI operations). The words users see are in each flow's `catalog/tr.json` and `catalog/en.json`, copied from `libs/i18n`.

## Reading it

```sh
npx @delurio/cli@0.1.1 page graphs --out viz      # every graph's page, and viz/index.html listing them
npx @delurio/cli@0.1.1 check graphs --strict --baseline graphs/delurio.baseline.sarif
npx @delurio/cli@0.1.1 diff graphs/learning/enrollment --base origin/main
```

A page shows a flow in words: its main story, every way it ends, its guarantees and whether they hold, its screens as wireframes and its diagram. `viz/` is ignored by git.

## In CI

The `Graphs` workflow (`.github/workflows/graphs.yaml`) runs when a pull request touches `graphs/`:
- `check --strict` against `delurio.baseline.sarif`;
- a comment that says in words what the pull request changes in the graphs;
- the pages of the changed graphs as an artifact.

The baseline holds the findings known when it was written; they still show as warnings, and only a new error fails. Renew it after a fix, or after a finding is accepted, with `npx @delurio/cli@0.1.1 check graphs --format sarif --output graphs/delurio.baseline.sarif`, and review its diff in the pull request.

## Keeping it true

The graph does not follow the code by itself. When behaviour changes, the flow that describes it changes in the same pull request. The `source:` lines point at `ce47fce8` and drift as files change. The navigation graphs are extracted again from the app source with delurio's extractor, which fails instead of guessing when a shape it reads has changed.
