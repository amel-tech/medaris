import { relations } from "drizzle-orm";
import {
  boolean,
  primaryKey,
  pgTable as table,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { flashcards } from "./flashcard.schema";

// Tables
export const decks = table("decks", {
  id: uuid("id").primaryKey().defaultRandom(),
  authorId: uuid("author_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  isPublic: boolean("is_public").default(false).notNull(),
  // Hidden (MDRS-173); see `kosks.archived_at`. Null while shown.
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  archivedBy: uuid("archived_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const decksUsers = table(
  "decks_users",
  {
    userId: uuid("user_id").notNull(),
    deckId: uuid("deck_id")
      .references(() => decks.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.deckId] })]
);

// ORM Relations
export const decksRelations = relations(decks, ({ many }) => ({
  flashcards: many(flashcards),
  decksUsers: many(decksUsers),
}));

export const decksUsersRelations = relations(decksUsers, ({ one }) => ({
  deck: one(decks, {
    fields: [decksUsers.deckId],
    references: [decks.id],
  }),
}));
