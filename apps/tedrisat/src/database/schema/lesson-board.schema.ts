import { sql } from "drizzle-orm";
import {
  check,
  integer,
  jsonb,
  pgTable as table,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { lessons } from "./course.schema";

/**
 * A session's board: the canvas the müderris teaches on (a book page, the
 * marks drawn over it, text, a sarf table). One per session. `scene` is the
 * canvas component's own document (its elements and the little of its state a
 * reader needs), kept as it was sent; an image on it is not in the scene but a
 * row of `lesson_board_files`, its bytes in object storage.
 */
export const lessonBoards = table("lesson_boards", {
  lessonId: uuid("lesson_id")
    .primaryKey()
    .references(() => lessons.id, { onDelete: "restrict" }),
  scene: jsonb("scene").notNull(),
  updatedBy: uuid("updated_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * An image on a session's board. `file_key` is the id the canvas gave the
 * image and names it in the scene; the object itself is under a key tedrisat
 * makes. A file is uploaded before the scene that shows it is saved, so a row
 * may briefly belong to no saved scene; saving a scene removes the files it no
 * longer shows.
 */
export const lessonBoardFiles = table(
  "lesson_board_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lessonId: uuid("lesson_id")
      .references(() => lessons.id, { onDelete: "restrict" })
      .notNull(),
    fileKey: text("file_key").notNull(),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedBy: uuid("uploaded_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("lesson_board_files_lesson_key_idx").on(t.lessonId, t.fileKey),
    uniqueIndex("lesson_board_files_storage_key_idx").on(t.storageKey),
    check("lesson_board_files_size_positive", sql`${t.sizeBytes} > 0`),
  ]
);
