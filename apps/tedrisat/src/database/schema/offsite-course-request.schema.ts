import {
  index,
  pgEnum,
  pgTable as table,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { kosks } from "./kosk.schema";
import { madrasahs } from "./madrasah.schema";

export const OFFSITE_REQUEST_STATUSES = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
} as const;
export type OffsiteRequestStatus =
  (typeof OFFSITE_REQUEST_STATUSES)[keyof typeof OFFSITE_REQUEST_STATUSES];

export const offsiteRequestStatus = pgEnum("offsite_request_status", [
  OFFSITE_REQUEST_STATUSES.PENDING,
  OFFSITE_REQUEST_STATUSES.ACCEPTED,
  OFFSITE_REQUEST_STATUSES.REJECTED,
]);

// A medrese asking a köşk to open a course that is not the medrese's own
// (MDRS-187, nazir/09 "Medrese dışı ders talebi"). It creates no course: the
// köşk's nazım reads it and, on accepting, opens the course by hand, which
// stays a köşk course with no medrese. Written as PENDING; accepting and
// rejecting it belong to the köşk side's screens (nizam/39) and add the
// columns that record the decision. `requested_by` is not a foreign key, like
// every other user column. Both foreign keys cascade, as on
// `madrasah_kosk_hosting`: deleting a medrese or a köşk (SYSTEM_ADMIN only)
// takes its requests with it.
export const offsiteCourseRequests = table(
  "offsite_course_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    madrasahId: uuid("madrasah_id")
      .references(() => madrasahs.id, { onDelete: "cascade" })
      .notNull(),
    koskId: uuid("kosk_id")
      .references(() => kosks.id, { onDelete: "cascade" })
      .notNull(),
    title: text("title").notNull(),
    reason: text("reason").notNull(),
    requestedBy: uuid("requested_by").notNull(),
    status: offsiteRequestStatus()
      .default(OFFSITE_REQUEST_STATUSES.PENDING)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // The medrese's own list, newest first.
    index("offsite_course_requests_madrasah_idx").on(
      t.madrasahId,
      t.createdAt.desc()
    ),
  ]
);
