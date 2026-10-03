# MDRS-78 — drop the two orphan tables and `example.schema.ts`

## What was left of the issue

MDRS-78 listed four tables and four columns of drift between
`apps/tedrisat/src/database/schema` and the committed migration history. Most of
it was already repaired on `main` before this branch started:

| Item from the issue | Repaired by |
| -- | -- |
| `Flashcard_labeling` / `flashcard_labelings` (MDRS-77) | `0013_label_schema_drift` — renamed, data kept |
| `flashcard_label_stats.usage_count`, `deck_label_stats.label_id` | `0013_label_schema_drift` |
| `deck_labelings.private_to_user_id` nullable, `create_at` default | `0013_label_schema_drift` |
| Deck `getLabelStats` empty guard | already on `main` (`flashcard-deck-label.repository.ts`, `if (!row) return null`) |
| `examples` orphan table | **this change** |
| `deck_labels_decks` orphan table | **this change** |
| `example.schema.ts` and its re-export | **this change** |

`0013` deliberately left `deck_labels_decks` alone (see
`mdrs-56-flashcard-label-authz.md`, "Follow-up 1 closed") and `examples` was kept
in the schema by MDRS-32 until a dedicated drop migration existed. This is that
migration.

## What was done

- Deleted `apps/tedrisat/src/database/schema/example.schema.ts` and its
  re-export (plus the comment explaining it) in `schema/index.ts`. Nothing under
  `src/` or `test/` imported it.
- Ran `drizzle-kit generate --name drop_orphan_tables`. With no created table on
  the schema side there was no rename prompt; the generator numbered it itself
  and wrote all three artefacts together:
  - `migrations/0014_drop_orphan_tables.sql`
  - `migrations/meta/0014_snapshot.json` (`prevId` = `0013`'s `id`)
  - the `idx: 14` entry in `migrations/meta/_journal.json`

  ```sql
  DROP TABLE "examples" CASCADE;
  DROP TABLE "deck_labels_decks" CASCADE;
  ```

  Neither table is referenced by any foreign key (`deck_labels_decks` only
  references `decks` and `deck_label`), so `CASCADE` removes only their own
  constraints. The SQL file was not edited by hand; only a trailing newline was
  added to the two JSON files, matching every earlier snapshot.
- Updated the schema-drift lens in `.coderabbit.yaml`, which still described
  seven schema files, 19 tables, `example.schema.ts` and migrations up to `0013`.
- Added a regression guard to `apps/tedrisat/test/e2e/app.e2e.spec.ts`: after
  the migrations run against the Testcontainers database, the set of tables in
  `public` must equal the set of `PgTable`s exported from `src/database/schema`.
  Any future table created by a migration but declared nowhere — or declared but
  never created, the MDRS-77 shape — fails that test.

## What was verified

- `drizzle-kit generate` run a second time: `No schema changes, nothing to
  migrate`. `drizzle-kit check`: `Everything's fine`.
- `vitest run test/e2e/app.e2e.spec.ts`: 9/9 green against a freshly migrated
  `postgres:17-alpine`.
- Fail-closed: with `0014` reduced to the `examples` drop only, the new test
  fails (`deck_labels_decks` still present); restored, it passes.
- `nx affected -t typecheck test build lint module-boundaries --base=<branch
  base>`: affected set is `tedrisat` alone; all five targets green (plus
  `env:typecheck`, `common:typecheck`, `common:build`), with Docker running.

## What was not verified

- **Row counts in any deployed database.** Whether `examples` or
  `deck_labels_decks` hold rows in staging or production was not checked; no
  code has written to either table since MDRS-32 (`examples`) or ever
  (`deck_labels_decks`, declared in no schema file). The drop is destructive and
  forward-only: the rows are gone once `0014` runs. Anyone who wants them kept
  should dump the two tables before the deploy that carries this migration.
- The migration was applied only to fresh test databases, never to a database
  that had already run `0000`–`0013` in the past. The statements do not depend on
  prior state beyond the two tables existing, which every database migrated
  through `0007` satisfies.

## Follow-ups

- None required for the drift itself. The e2e guard covers table-level drift
  only; column-level drift (the `0007` class) is still caught only by
  `drizzle-kit generate` producing a non-empty diff.
