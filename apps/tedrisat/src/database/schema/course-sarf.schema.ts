import { sql } from "drizzle-orm";
import {
  check,
  pgTable as table,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { courses } from "./course.schema";

/**
 * The roots a course's müderris put on its sarf page: a root and its bâb, from
 * which `@medaris/sarf` writes the Emsile's twenty-four sîgas and their çekim
 * in the browser. Nothing derived is stored; the row is only what the engine
 * cannot know (the bâb, the Turkish mastar, the masdar's vezin).
 */
export const courseSarfRoots = table(
  "course_sarf_roots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .references(() => courses.id, { onDelete: "restrict" })
      .notNull(),
    /** Three letters, a space between: `ن ص ر`. */
    kok: text("kok").notNull(),
    bab: text("bab").notNull(),
    /** The Turkish mastar the meanings are built on: `yardım etmek`. */
    mastar: text("mastar"),
    masdarVezin: text("masdar_vezin").notNull(),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("course_sarf_roots_course_kok_bab_idx").on(
      t.courseId,
      t.kok,
      t.bab
    ),
    check(
      "course_sarf_roots_bab_known",
      sql`${t.bab} in ('nasara', 'daraba', 'fataha', 'semia', 'hasune', 'hasibe')`
    ),
  ]
);
