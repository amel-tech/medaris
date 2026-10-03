import {
  index,
  pgTable as table,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { courses } from "./course.schema";
import { kosks } from "./kosk.schema";
import { madrasahs } from "./madrasah.schema";

export const COURSE_REQUEST_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
] as const;
export type CourseRequestStatus = (typeof COURSE_REQUEST_STATUSES)[number];

/**
 * A medrese's request to run a course in a köşk it does not belong to
 * (MDRS-181, nizam/39). The başmüderris sends it, the köşk's nazımı accepts
 * it by opening the course (`course_id` then points at it) or refuses it with
 * a reason. `status` is text, like the other request tables.
 */
export const courseRequests = table(
  "course_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    koskId: uuid("kosk_id")
      .references(() => kosks.id, { onDelete: "cascade" })
      .notNull(),
    madrasahId: uuid("madrasah_id")
      .references(() => madrasahs.id, { onDelete: "cascade" })
      .notNull(),
    title: text("title").notNull(),
    reason: text("reason").notNull(),
    requestedBy: uuid("requested_by").notNull(),
    status: text("status").default("PENDING").notNull(),
    rejectReason: text("reject_reason"),
    decidedBy: uuid("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    courseId: uuid("course_id").references(() => courses.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("course_requests_kosk_status_idx").on(t.koskId, t.status)]
);
