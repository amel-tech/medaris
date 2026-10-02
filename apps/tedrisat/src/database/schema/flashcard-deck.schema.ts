import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  primaryKey,
  pgTable as table,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { flashcards } from "./flashcard.schema";
import { kosks } from "./kosk.schema";

// Tables
export const decks = table(
  "decks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    isPublic: boolean("is_public").default(false).notNull(),
    // The köşk the deck belongs to (MDRS-159): a "köşk destesi", open to the
    // talebe of that köşk's courses. Null for a talebe's own deck. A köşk that
    // goes leaves its decks to their authors.
    koskId: uuid("kosk_id").references(() => kosks.id, {
      onDelete: "set null",
    }),
    // Hidden (MDRS-173); see `kosks.archived_at`. Null while shown.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: uuid("archived_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("decks_kosk_id_idx").on(table.koskId)]
);

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
