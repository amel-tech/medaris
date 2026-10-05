import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  pgTable as table,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// The last calendar invitation one talebe was e-mailed for one session
// (MDRS-121). One row per (session, talebe): the row is what makes the
// invitation the same calendar event across its whole life.
//
// - `sequence` is the iCalendar SEQUENCE of the last message sent to this
//   address for this session's UID. Every REQUEST after the first and every
//   CANCEL raise it by one, so a calendar takes each message as newer than
//   the one before (RFC 5546 §2.1.4).
// - `starts_at`, `duration_minutes`, `course_title` and `lesson_title` are
//   what that message said. A session whose live values differ from them is
//   sent again as an update; a CANCEL repeats them, as the calendar expects.
// - `cancelled_at` is set when a CANCEL went out. A later REQUEST for the
//   same session clears it again.
//
// The row outlives its session on purpose. `lesson_id` and `course_id` are
// plain columns, not foreign keys, so deleting a session, a week, a course or
// a köşk (MDRS-124) leaves the row behind; the sweep then finds an invitation
// whose session is gone, sends its CANCEL, and only after that — or once the
// time it named has passed — deletes the row (`pruneOrphans`). A key, RESTRICT
// or CASCADE, would make the delete take the row first and the event would
// stay in the talebe's calendar. `course_id` is kept for the CANCEL's session
// page link. `user_id` is the Keycloak `sub` and, like every other user
// column, not a foreign key.
export const lessonInvitations = table(
  "lesson_invitations",
  {
    lessonId: uuid("lesson_id").notNull(),
    courseId: uuid("course_id").notNull(),
    userId: uuid("user_id").notNull(),
    sequence: integer("sequence").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes"),
    courseTitle: text("course_title").notNull(),
    lessonTitle: text("lesson_title").notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.lessonId, t.userId] }),
    // The sweep's cancellation pass reads the invitations still standing for
    // sessions that have not started yet.
    index("lesson_invitations_open_starts_at_idx")
      .on(t.startsAt)
      .where(sql`${t.cancelledAt} is null`),
  ]
);
