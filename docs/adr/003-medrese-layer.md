# ADR-003: The Medrese Layer — Built as PRD §4.1 Draws It, in tedrisat

**Status:** Proposed
**Date:** 2026-09-28
**Authors:** Argedik
**Issue:** [MDRS-106](https://linear.app/amel-tech/issue/MDRS-106) (parent [MDRS-94](https://linear.app/amel-tech/issue/MDRS-94))

> **Naming (4 October 2026).** The owner renamed the three delegated roles: the
> medrese's role is now **medrese vekili** (formerly medrese nazırı), alongside
> **Medaris vekili** and **ders vekili**. The app name **nazir** stays. Code
> identifiers (`MADRASAH_NAZIR`, `madrasah_nazirs`), stored role strings and
> routes keep their current spelling until the rename sweep, MDRS-144.

## Context

`docs/PRD.md` §4.1 draws a three-level hierarchy: a **medrese** is an optional
top layer (an institution), a **köşk** belongs to at most one medrese or stands
alone, and every course belongs to exactly one köşk. A **medrese vekili**
governs a medrese — affiliates köşks, invites and removes vekiller — and has no
direct authority over individual courses (PRD §3 persona table, §4.1 bullets).

Before this ADR only köşks existed in code. PRD M2-6 and OQ-10 asked for the
hierarchy to be settled before anyone built it, because the source material
described it as muddled.

The authorization matrix (`libs/common/src/authz/auth-matrix.ts`) already
carried a `MADRASAH_NAZIR` row for `madrasah` and for `kosk`, both marked
UNREACHABLE since MDRS-41: `TedrisatRoleResolver` returned `PUBLIC` for every
medrese and never produced `MADRASAH_NAZIR` for a köşk.

Two facts decide where the code goes:

- **tedrisat** owns `kosks`, its Postgres schema and migrations, and the one
  `RoleResolver` implementation (`apps/tedrisat/src/authz/`).
- **teskilat**, which the PRD names for this work (M2, Phase 3 item 3.1), has
  no database and no authentication yet (`apps/teskilat/src/app.module.ts`
  imports neither a database module nor `AuthGuardModule`).

## Decision

### D1 — The hierarchy is the one §4.1 draws

The owner settled M2-6 / OQ-10 on 26 September 2026: build it exactly as §4.1
draws it.

- `madrasahs` (`id`, unique `handle`, `name`, `description`, `cover_hue`,
  `created_by`, timestamps).
- `madrasah_nazirs` (`madrasah_id`, `user_id`, `created_at`; primary key is
  the pair). A medrese may have several vekiller.
- `kosks.madrasah_id`: nullable foreign key, `ON DELETE SET NULL`. A köşk
  belongs to at most one medrese; deleting a medrese makes its köşks
  standalone rather than deleting them.
- Courses do not reference the medrese. A vekil reaches a course only through
  its köşk, and gets no course scopes from being a vekil.

### D2 — The code lives in tedrisat

Schema, endpoints (`/madrasahs…`) and resolver branches are added to
**tedrisat**, beside `kosks` and the resolver that needs both. Putting them in
teskilat would first require giving teskilat a database, authentication and a
way to answer "is this caller a vekil of this köşk's medrese" across a service
boundary on every köşk request. Moving the layer to teskilat later is a
separate decision, with its own ADR.

### D3 — Authorization goes through the matrix

- Creating a medrese is `CREATE_MADRASAH`, which no matrix row grants: only
  `SYSTEM_ADMIN`, through the realm-role bypass.
- Deleting a medrese is `DELETE`, which is removed from the vekil row: only
  `SYSTEM_ADMIN` (the owner's decision of 26 September, MDRS-124). A vekil will
  hide their medrese instead once MDRS-124 lands hiding.
- `TedrisatRoleResolver` returns `MADRASAH_NAZIR` for a medrese whose vekil
  list contains the caller, and for a köşk whose medrese does. On a köşk the
  manager role wins when a caller holds both, because the vekil's köşk scopes
  are a strict subset of the manager's.

## Alternatives Considered

- **Build it in teskilat, as the PRD says.** Lost on cost and timing: teskilat
  has no database or authentication, and the köşk role check would become a
  cross-service call inside the authorization guard.
- **A join table for köşk affiliation (many medreses per köşk).** Rejected by
  §4.1 itself: a köşk belongs to at most one medrese. A nullable column states
  that rule in the schema.
- **`ON DELETE CASCADE` from medrese to köşk.** Rejected: it would erase every
  course of every affiliated köşk with one delete, the failure MDRS-124 exists
  to remove.

## Consequences

### Positive

- The two UNREACHABLE `MADRASAH_NAZIR` rows become reachable; everything a
  vekil may do is decided by the matrix, not by ad-hoc checks.
- Existing köşks are untouched: the new column is null for all of them.

### Negative

- The medrese layer sits in the service the PRD did not intend for it. A later
  move to teskilat means a data migration across databases.
- Affiliation needs no consent from the köşk's manager: a vekil can bind any
  standalone köşk and thereby gain `EDIT` and `MANAGE_COURSES` on it. A köşk
  that already belongs to another medrese is refused (409), and the köşk's
  manager can leave at any time (`DELETE /kosks/:id/madrasah`). Whether a consent
  step is wanted is an open product question (see MDRS-106's migration note).

### Neutral

- tedrisat's migrations cannot run backwards; the reversal of this layer is a
  hand-applied script, `apps/tedrisat/src/database/rollbacks/0017_madrasahs.down.sql`.

## Related

- `docs/PRD.md` §4.1, M2-2…M2-6, OQ-10 (not edited by this ADR).
- MDRS-41 (authz port, UNREACHABLE rows), MDRS-124 (hide instead of delete),
  MDRS-107 (medrese screens in nizam), MDRS-126 (several köşk managers).
- `docs/migration/mdrs-106-medrese-layer.md` — what was built and verified.
