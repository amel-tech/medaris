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
import { DeckPublishStatus } from "../../flashcard/domain/deck-publish-status.enum";
import { FlashcardType } from "../../flashcard/domain/flashcard-type.enum";
import { courses } from "./course.schema";
import { flashcards } from "./flashcard.schema";
import { flashcardType } from "./flashcard-enums.schema";
import { kosks } from "./kosk.schema";
import { madrasahs } from "./madrasah.schema";
import { scopeType } from "./scope-type.schema";

// Tables
export const decks = table(
  "decks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    isPublic: boolean("is_public").default(false).notNull(),
    // What the deck's cards are (MDRS-164): a deck holds one kind, the way the
    // design lists it ("36 kart · Kelime"). Cards keep their own `type`.
    cardType: flashcardType("card_type")
      .default(FlashcardType.VOCABULARY)
      .notNull(),
    // The author's request to publish and the reviewer's answer; see
    // `DeckPublishStatus`. `publishRequestedAt` is set while PENDING only.
    publishStatus: text("publish_status")
      .$type<DeckPublishStatus>()
      .default(DeckPublishStatus.PRIVATE)
      .notNull(),
    publishRequestedAt: timestamp("publish_requested_at", {
      withTimezone: true,
    }),
    // The Medaris başnazımı's answer (MDRS-180): when and by whom, and the
    // reason of a refusal. Cleared when the author asks again.
    publishDecidedAt: timestamp("publish_decided_at", { withTimezone: true }),
    publishDecidedBy: uuid("publish_decided_by"),
    publishRejectReason: text("publish_reject_reason"),
    // Free labels the author types on the create form; only the author reads
    // them back. Not the `deck_label` tables: those need a title of five
    // characters and a second request per label.
    tags: text("tags").array().default([]).notNull(),
    // Where the deck belongs, if anywhere (MDRS-164): a "ders destesi", a
    // "köşk destesi" (`koskId` below), a "medrese destesi". At most one is set
    // by convention; the talebe enrolled in the course, in a course of that
    // köşk or in a course of that medrese may read it (`deckSharedWith`).
    courseId: uuid("course_id").references(() => courses.id, {
      onDelete: "set null",
    }),
    madrasahId: uuid("madrasah_id").references(() => madrasahs.id, {
      onDelete: "set null",
    }),
    // The köşk the deck belongs to (MDRS-159): a "köşk destesi", open to the
    // talebe of that köşk's courses. Null for a talebe's own deck. A köşk that
    // goes leaves its decks to their authors.
    koskId: uuid("kosk_id").references(() => kosks.id, {
      onDelete: "set null",
    }),
    // Hidden (MDRS-173); see `kosks.archived_at`. Null while shown.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: uuid("archived_by"),
    // The level the hider acted at (MDRS-135); see `kosks.archived_level`.
    archivedLevel: scopeType("archived_level"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("decks_kosk_id_idx").on(table.koskId),
    index("decks_course_id_idx").on(table.courseId),
    index("decks_madrasah_id_idx").on(table.madrasahId),
    // The answered requests of nizam/16 are read newest answer first
    // (`DeckReviewRepository.listRequests`).
    index("decks_publish_decided_at_idx").on(table.publishDecidedAt),
  ]
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
