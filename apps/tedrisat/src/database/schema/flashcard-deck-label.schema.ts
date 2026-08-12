import { relations } from "drizzle-orm";
import {
  integer,
  pgTable as table,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { Scope } from "../../flashcard/domain/flashcard-label.enum";
import { decks } from "./flashcard-deck.schema";

// Tables
export const deckLabels = table("deck_label", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  scope: text("scope").$type<Scope>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: uuid("created_by").notNull(),
});

export const deckLabelings = table("deck_labelings", {
  id: uuid("id").primaryKey().defaultRandom(),
  labelId: uuid("label_id")
    .notNull()
    .references(() => deckLabels.id, { onDelete: "cascade" }),
  privateToUserId: uuid("private_to_user_id"),
  deckId: uuid("deck_id")
    .notNull()
    .references(() => decks.id, {
      onDelete: "cascade",
    }),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("create_at").notNull().defaultNow(),
});

export const deckLabelsStats = table("deck_label_stats", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),

  labelId: uuid("label_id")
    .notNull()
    .references(() => deckLabels.id, { onDelete: "cascade" }),

  usageCount: integer("usage_count").notNull().default(0),

  lastUsedAt: timestamp("last_used_at", { mode: "date" }).notNull(),
});

// ORM Relations
export const deckLabelRelations = relations(deckLabels, ({ many }) => ({
  labelings: many(deckLabelings),
  stats: many(deckLabelsStats),
}));
export const deckLabelingRelations = relations(deckLabelings, ({ one }) => ({
  label: one(deckLabels, {
    fields: [deckLabelings.labelId],
    references: [deckLabels.id],
  }),

  deck: one(decks, {
    fields: [deckLabelings.deckId],
    references: [decks.id],
  }),
}));
export const deckLabelStatsRelations = relations(
  deckLabelsStats,
  ({ one }) => ({
    label: one(deckLabels, {
      fields: [deckLabelsStats.labelId],
      references: [deckLabels.id],
    }),
  })
);
