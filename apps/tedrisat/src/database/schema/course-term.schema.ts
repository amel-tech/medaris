import {
  index,
  pgTable as table,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { courses } from "./course.schema";

/**
 * A course's glossary (lügat): the terms its müderris defines for it. A term
 * has the word as the course says it, its Arabic spelling, what it means in
 * the language (lügat manası), what it means as a term of the science
 * (ıstılah manası) and an example; only the word is required.
 */
export const courseTerms = table(
  "course_terms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .references(() => courses.id, { onDelete: "restrict" })
      .notNull(),
    term: text("term").notNull(),
    arabic: text("arabic"),
    lexicalMeaning: text("lexical_meaning"),
    technicalMeaning: text("technical_meaning"),
    example: text("example"),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("course_terms_course_idx").on(t.courseId)]
);
