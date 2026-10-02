import { relations } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  primaryKey,
  pgTable as table,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { CourseLevel } from "../../course/domain/course-level.enum";
import { CourseStatus } from "../../course/domain/course-status.enum";
import { EnrollmentStatus } from "../../course/domain/enrollment-status.enum";
import { LessonType } from "../../course/domain/lesson-type.enum";
import { kosks } from "./kosk.schema";
import { madrasahs } from "./madrasah.schema";

// Enums
export const courseLevel = pgEnum("course_level", CourseLevel);
export const courseStatus = pgEnum("course_status", CourseStatus);
export const lessonType = pgEnum("lesson_type", LessonType);
export const enrollmentStatus = pgEnum("enrollment_status", EnrollmentStatus);

// Tables
//
// Every foreign key in this file is `ON DELETE RESTRICT` (MDRS-124). They were
// CASCADE, so one DELETE of a köşk silently took every course, week, lesson,
// müderris, resource and enrollment under it. Now a stray DELETE fails loudly,
// and the one path that deletes for real — SYSTEM_ADMIN's, in
// `course/course-purge.ts` — removes the children itself, in one transaction,
// and writes what it removed to `audit_log`.
export const courses = table("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  koskId: uuid("kosk_id")
    .references(() => kosks.id, { onDelete: "restrict" })
    .notNull(),
  // The medrese the course belongs to, if any (MDRS-134). A course belongs to
  // exactly one köşk and optionally to one medrese, which may open courses in
  // that köşk only while it holds a hosting right there (MDRS-137). Its
  // enrolled talebe are that medrese's talebe — derived, never stored
  // (`MadrasahRepository.findTalebeIds`). SET NULL, not RESTRICT like the
  // keys below: deleting a medrese (SYSTEM_ADMIN only) leaves its courses
  // standing as köşk courses, as it used to leave its köşks standing alone.
  madrasahId: uuid("madrasah_id").references(() => madrasahs.id, {
    onDelete: "set null",
  }),
  authorId: uuid("author_id").notNull(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  description: text("description"),
  category: text("category"),
  level: courseLevel().default(CourseLevel.BEGINNER).notNull(),
  language: text("language"),
  coverHue: integer("cover_hue").default(220).notNull(),
  durationWeeks: integer("duration_weeks").default(0).notNull(),
  status: courseStatus().default(CourseStatus.DRAFT).notNull(),
  grantsCertificate: boolean("grants_certificate").default(false).notNull(),
  requiresApproval: boolean("requires_approval").default(false).notNull(),
  // IANA zone the course's sessions are authored in (MDRS-110). An editor
  // types "21:00" meaning 21:00 here; talebe elsewhere see it converted.
  timeZone: text("time_zone").default("Europe/Istanbul").notNull(),
  // Optimistic-concurrency token (MDRS-95). Every write to the course or to
  // its syllabus bumps it; a whole-course PUT or a lesson PATCH that carries
  // a stale value is refused with 409 instead of overwriting the newer save.
  // A counter rather than `updated_at`: the column is a naive timestamp with
  // microsecond precision, which a JSON round-trip truncates to milliseconds.
  version: integer("version").default(0).notNull(),
  // Hidden by its köşk manager (MDRS-124). Reads leave a hidden course out and
  // answer 404 for it, as they do for a draft, except to the people who may
  // bring it back: the köşk manager and SYSTEM_ADMIN. `archivedBy` is the
  // account that hid it — not a foreign key, like every other user column.
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  archivedBy: uuid("archived_by"),
  // Passive (MDRS-134): the course lost its last admin and nobody above took
  // it over (MDRS-133, MDRS-136). Separate from `archived_at`, which is
  // hiding (MDRS-124): nobody hid a passive course, it is unattended. Null
  // while active.
  passiveSince: timestamp("passive_since", { withTimezone: true }),
  passiveReason: text("passive_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const courseWeeks = table("course_weeks", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id")
    .references(() => courses.id, { onDelete: "restrict" })
    .notNull(),
  weekNumber: integer("week_number").notNull(),
  title: text("title").notNull(),
  summary: text("summary"),
  orderIndex: integer("order_index").default(0).notNull(),
  // Set when a whole-course PUT drops the week (MDRS-95). The row is kept so
  // that its archived lessons — and whatever points at them — survive. A
  // DELETE here is refused while the week holds any lesson (MDRS-124).
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const lessons = table(
  "lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    weekId: uuid("week_id")
      .references(() => courseWeeks.id, { onDelete: "restrict" })
      .notNull(),
    title: text("title").notNull(),
    type: lessonType().notNull(),
    // Deprecated (MDRS-110): the free-text duration ("60 dk") it replaces.
    // Nothing reads or writes it any more; migration 0019 copied its minutes
    // into `duration_minutes`, and a follow-up migration drops it once the
    // release that stopped using it is live.
    duration: text("duration"),
    // Length of the lesson in whole minutes (MDRS-110). A calendar event needs
    // an end time, and free text could not give one.
    durationMinutes: integer("duration_minutes"),
    kaynak: text("kaynak"),
    // Live-session fields (type = LIVE). `withTimezone` because students and
    // müderris may be in different zones; created/updated remain naive for
    // backward compatibility with the original migration.
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    meetingUrl: text("meeting_url"),
    agenda: jsonb("agenda").$type<{ time: string; title: string }[]>(),
    isPreview: boolean("is_preview").default(false).notNull(),
    orderIndex: integer("order_index").default(0).notNull(),
    // Cancellation of a live session (MDRS-158). A cancelled session stays in
    // the programme and keeps its slot, marked rather than removed: talebe
    // see "İptal edildi" there, and the calendar feed can say so. The reason
    // is course content (`view_details`), like the meeting link. Whether it
    // is happening, over or still ahead is never stored — it follows from
    // `scheduled_at` and `duration_minutes`.
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    // The session that makes up for the cancelled one. SET NULL: a replacement
    // that is later removed leaves the cancellation standing without a link.
    replacementLessonId: uuid("replacement_lesson_id").references(
      (): AnyPgColumn => lessons.id,
      { onDelete: "set null" }
    ),
    // Removing a lesson hides it; it never deletes it (MDRS-95, following the
    // MDRS-124 decision). Recordings and calendar events will reference lesson
    // ids.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  // The calendar feed's range predicate (MDRS-120), run on every calendar
  // app's poll of every subscriber.
  (t) => [index("lessons_scheduled_at_idx").on(t.scheduledAt)]
);

export const courseMuderris = table(
  "course_muderris",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .references(() => courses.id, { onDelete: "restrict" })
      .notNull(),
    userId: uuid("user_id"),
    name: text("name").notNull(),
    title: text("title"),
    bio: text("bio"),
    avatarHue: integer("avatar_hue").default(220).notNull(),
    orderIndex: integer("order_index").default(0).notNull(),
  },
  // Covers `CourseRepository.isMuderris` — the (courseId, userId) lookup the
  // authorization resolver runs on every course request (MDRS-41) — and, by
  // its leading column, the plain "müderris of this course" listing. Postgres
  // does not index the referencing side of a foreign key on its own, and the
  // surrogate primary key serves neither access path.
  (table) => [
    index("course_muderris_course_id_user_id_idx").on(
      table.courseId,
      table.userId
    ),
  ]
);

export const courseResources = table("course_resources", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id")
    .references(() => courses.id, { onDelete: "restrict" })
    .notNull(),
  name: text("name").notNull(),
  meta: text("meta"),
  type: text("type"),
  url: text("url"),
  orderIndex: integer("order_index").default(0).notNull(),
});

export const enrollments = table(
  "enrollments",
  {
    userId: uuid("user_id").notNull(),
    courseId: uuid("course_id")
      .references(() => courses.id, { onDelete: "restrict" })
      .notNull(),
    studentName: text("student_name"),
    studentEmail: text("student_email"),
    progress: integer("progress").default(0).notNull(),
    status: enrollmentStatus().default(EnrollmentStatus.ENROLLED).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.courseId] })]
);

// ORM Relations
export const coursesRelations = relations(courses, ({ one, many }) => ({
  kosk: one(kosks, {
    fields: [courses.koskId],
    references: [kosks.id],
  }),
  weeks: many(courseWeeks),
  muderris: many(courseMuderris),
  resources: many(courseResources),
  enrollments: many(enrollments),
}));

export const courseWeeksRelations = relations(courseWeeks, ({ one, many }) => ({
  course: one(courses, {
    fields: [courseWeeks.courseId],
    references: [courses.id],
  }),
  lessons: many(lessons),
}));

export const lessonsRelations = relations(lessons, ({ one }) => ({
  week: one(courseWeeks, {
    fields: [lessons.weekId],
    references: [courseWeeks.id],
  }),
}));

export const courseMuderrisRelations = relations(courseMuderris, ({ one }) => ({
  course: one(courses, {
    fields: [courseMuderris.courseId],
    references: [courses.id],
  }),
}));

export const courseResourcesRelations = relations(
  courseResources,
  ({ one }) => ({
    course: one(courses, {
      fields: [courseResources.courseId],
      references: [courses.id],
    }),
  })
);

export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  course: one(courses, {
    fields: [enrollments.courseId],
    references: [courses.id],
  }),
}));
