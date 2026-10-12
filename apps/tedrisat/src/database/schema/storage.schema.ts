import {
  index,
  integer,
  pgTable as table,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Objects in file storage that no row points at any more, waiting to be
 * removed from the store (MDRS-287). A row is written in the same transaction
 * that drops the last reference — a resource taken off a list, a homework file
 * deleted, a course, week or celse purged — so a delete that rolls back leaves
 * the file in place, and one that commits is never forgotten, even when the
 * store does not answer: `StorageDeletionService` retries until it does, and
 * `attempts` and `last_error` are the record of each failure, as the issue
 * asks.
 *
 * An upload writes one first, `due_at` an hour ahead, and the transaction that
 * stores the file's row deletes it: if the process dies between storing the
 * object and recording it, the object is still removed once the hour is up.
 */
export const storageDeletions = table(
  "storage_deletions",
  {
    storageKey: text("storage_key").primaryKey(),
    // Why it went: `resource.remove`, `course.purge`, `upload.unclaimed`, ...
    reason: text("reason").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).defaultNow().notNull(),
    attempts: integer("attempts").default(0).notNull(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  // The sweep reads what is due, oldest first.
  (t) => [index("storage_deletions_due_at_idx").on(t.dueAt)]
);
