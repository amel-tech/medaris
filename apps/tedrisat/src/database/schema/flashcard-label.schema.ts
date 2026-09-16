import { relations } from "drizzle-orm";
import {
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { Scope } from "../../flashcard/domain/flashcard-label.enum";
import { flashcards } from "./flashcard.schema";
export const flashcardLabels = pgTable("flashcard_labels", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("name").notNull(),
  scope: text("scope").$type<Scope>().notNull(),
  userId: uuid("user_id").notNull(),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const flashcardLabelStats = pgTable(
  "flashcard_label_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    labelId: uuid("label_id")
      .notNull()
      .references(() => flashcardLabels.id, { onDelete: "cascade" }),

    usageCount: integer("usage_count").notNull().default(0),

    lastUsedAt: timestamp("last_used_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  // `label_id` is the only column this table is ever filtered on — the stats
  // read, and `updateLabelStats`'s `UPDATE ... WHERE label_id = $1` on every
  // labeling, which takes no LIMIT and so scanned unconditionally. Postgres
  // indexes only the REFERENCED side of a foreign key, so nothing covered it.
  // `uniqueIndex` rather than `index`: the repository only ever reads
  // `stats[0]`, so one row per label is already the contract, and the
  // constraint both serves the lookup and stops a concurrent first-labeling
  // from inserting a second row. Safe to make unique here because the table
  // was unwritable until migration 0013 — every statement against it failed
  // on the `usageCount`/`usage_count` name drift.
  (table) => [
    uniqueIndex("flashcard_label_stats_label_id_idx").on(table.labelId),
  ]
);
export const flashcardLabelings = pgTable("flashcard_labelings", {
  id: uuid("id").primaryKey().defaultRandom(),

  labelId: uuid("label_id")
    .notNull()
    .references(() => flashcardLabels.id, { onDelete: "cascade" }),

  privateToUserId: uuid("private_to_user_id"),

  // `cascade`, not `set null`: the column is NOT NULL, so Postgres accepts
  // `SET NULL` at DDL time and only fails when a referenced card is actually
  // deleted — `null value in column "flashcard_id" ... violates not-null
  // constraint`, which made the card (and any deck holding it, since
  // `flashcards.deck_id` cascades) undeletable. It was unreachable only
  // because the table did not exist under this name until migration 0013. A
  // labeling has no meaning without its card, and `label_id` beside it and
  // `deck_labelings.deck_id` opposite both already cascade.
  flashcardId: uuid("flashcard_id")
    .references(() => flashcards.id, {
      onDelete: "cascade",
    })
    .notNull(),

  createdBy: uuid("created_by").notNull(),

  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// ORM Relations
export const flashcardLabelRelations = relations(
  flashcardLabels,
  ({ many }) => ({
    labelings: many(flashcardLabelings),
    stats: many(flashcardLabelStats),
  })
);

export const flashcardLabelingRelations = relations(
  flashcardLabelings,
  ({ one }) => ({
    label: one(flashcardLabels, {
      fields: [flashcardLabelings.labelId],
      references: [flashcardLabels.id],
    }),

    flashcard: one(flashcards, {
      fields: [flashcardLabelings.flashcardId],
      references: [flashcards.id],
    }),
  })
);

export const flashcardLabelStatsRelations = relations(
  flashcardLabelStats,
  ({ one }) => ({
    label: one(flashcardLabels, {
      fields: [flashcardLabelStats.labelId],
      references: [flashcardLabels.id],
    }),
  })
);
