import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  primaryKey,
  pgTable as table,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { FlashcardProgressStatus } from "../../flashcard/domain/flashcard-progress-status.enum";
import { decks } from "./flashcard-deck.schema";
import {
  flashcardProgressStatus,
  flashcardType,
} from "./flashcard-enums.schema";

// Tables
export const flashcards = table("flashcards", {
  id: uuid("id").primaryKey().defaultRandom(),
  deckId: uuid("deck_id")
    .references(() => decks.id, { onDelete: "cascade" })
    .notNull(),
  authorId: uuid("author_id").notNull(),
  type: flashcardType().notNull(),
  contentFront: text("content_front").notNull(),
  contentBack: text("content_back").notNull(),
  contentMeta: jsonb("content_meta"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const flashcardProgress = table(
  "flashcard_progress",
  {
    userId: uuid("user_id").notNull(),
    flashcardId: uuid("flashcard_id").notNull(),
    status: flashcardProgressStatus()
      .default(FlashcardProgressStatus.NEW)
      .notNull(),
    // The review schedule (MDRS-165): when the card is next due, when it was
    // last rated and how many days the last gap was. `dueAt` is null for a
    // row written without a rating (the old "memorised" toggle): such a LEARNING
    // card is due now, such a MASTERED one is never due.
    dueAt: timestamp("due_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    intervalDays: integer("interval_days").default(0).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.flashcardId] }),
    index("flashcard_progress_user_due_idx").on(table.userId, table.dueAt),
  ]
);

// ORM Relations
export const flashcardsRelations = relations(flashcards, ({ one, many }) => ({
  deck: one(decks, {
    fields: [flashcards.deckId],
    references: [decks.id],
  }),
  progress: many(flashcardProgress),
}));

export const flashcardProgressRelations = relations(
  flashcardProgress,
  ({ one }) => ({
    flashcard: one(flashcards, {
      fields: [flashcardProgress.flashcardId],
      references: [flashcards.id],
    }),
  })
);
