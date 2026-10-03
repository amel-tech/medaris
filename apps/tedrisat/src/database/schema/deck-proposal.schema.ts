import {
  index,
  pgTable as table,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { FlashcardType } from "../../flashcard/domain/flashcard-type.enum";
import { courses } from "./course.schema";
import { decks } from "./flashcard-deck.schema";
import { flashcardType } from "./flashcard-enums.schema";
import { kosks } from "./kosk.schema";

/**
 * A müderris's suggestion for a köşk deck (MDRS-180, screens nizam/30 and
 * 35). The köşk nazımı answers it: opening the deck from the proposal accepts
 * it (`deck_id` then points at the deck), refusing it keeps the reason for the
 * proposer to read in their notifications. `status` is text, like
 * `decks.publish_status`: PENDING, ACCEPTED or REJECTED.
 */
export const deckProposals = table(
  "deck_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    koskId: uuid("kosk_id")
      .references(() => kosks.id, { onDelete: "cascade" })
      .notNull(),
    // The course the müderris teaches that the deck is for; null when it left.
    courseId: uuid("course_id").references(() => courses.id, {
      onDelete: "set null",
    }),
    proposedBy: uuid("proposed_by").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    cardType: flashcardType("card_type")
      .default(FlashcardType.VOCABULARY)
      .notNull(),
    status: text("status").default("PENDING").notNull(),
    rejectReason: text("reject_reason"),
    decidedBy: uuid("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    deckId: uuid("deck_id").references(() => decks.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("deck_proposals_kosk_status_idx").on(t.koskId, t.status)]
);
