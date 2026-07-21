# Architecture Decision Records

Decisions that shape this repository. An ADR is written **before** the work that implements it, reviewed like code, and never edited into a different decision afterwards — supersede it with a new one instead.

## Index

| ID | Title | Status | Date |
| -- | -- | -- | -- |
| [ADR-001](001-monorepo-merge-and-layout.md) | Monorepo Merge — Target Layout, Boundary Taxonomy, and Toolchain | Proposed | 2026-07-21 |

## Process

1. Copy the template below into `docs/adr/NNN-short-kebab-title.md` (next free number, zero-padded to 3 digits).
2. Fill every section. If a section genuinely doesn't apply, say why in one line rather than deleting it. Optional additions (ADR-001 precedent): an `**Issue:**` metadata line under the header, and extra H2 sections (e.g. *Escalations*, *Corrections*) between Consequences and Related when the decision warrants them.
3. Open a PR; the ADR is **Proposed** until the team accepts it in review, then flip to **Accepted**.
4. Add the row to the index above.
5. To change an accepted decision: write a new ADR that supersedes the old one, set the old one's status to **Superseded**, and cross-link both. Implementation-status notes may be added to an accepted ADR as blockquote annotations with links.

## Statuses

`Proposed` → `Accepted` → (`Deprecated` | `Superseded`)

## Template

```markdown
# ADR-NNN: Title

**Status:** Proposed
**Date:** YYYY-MM-DD
**Authors:** Name(s)

## Context

What situation forces a decision? Facts only — verifiable against code, docs, or measurements.

## Decision

What we will do, stated so precisely that an implementer cannot misread it.
A multi-decision ADR may structure this section as `### D1 …`, `### D2 …` subsections
(ADR-001 is the precedent).

## Alternatives Considered

Each rejected option, with the real reason it lost.

## Consequences

### Positive

### Negative

### Neutral

## Related

Issues, sibling ADRs, reference repos, upstream sources.
```
