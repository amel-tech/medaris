import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable as table,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { courseRequests } from "./course-request.schema";
import { madrasahs } from "./madrasah.schema";

export const APPEAL_STATUSES = ["PENDING", "ACCEPTED", "REJECTED"] as const;
export type AppealStatus = (typeof APPEAL_STATUSES)[number];

export const APPEAL_REASON_MAX = 1000;

/**
 * A medrese's appeal against a köşk refusing its course request (nazar
 * "İtirazlar", nizam "İtirazlar"). One per request. The Medaris başnazımı, or
 * a Medaris nazımı holding `platform.appeal_decide`, decides it: accepting
 * puts the request back to PENDING for the köşk to decide again; refusing
 * closes it with a note. `status` is text, like `course_requests`. User
 * columns are no foreign keys, like every other user column.
 */
export const appeals = table(
  "appeals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    madrasahId: uuid("madrasah_id")
      .references(() => madrasahs.id, { onDelete: "cascade" })
      .notNull(),
    courseRequestId: uuid("course_request_id")
      .references(() => courseRequests.id, { onDelete: "cascade" })
      .notNull(),
    reason: text("reason").notNull(),
    status: text("status").default("PENDING").notNull(),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    decidedBy: uuid("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
  },
  (t) => [
    uniqueIndex("appeals_course_request_uq").on(t.courseRequestId),
    index("appeals_status_idx").on(t.status, t.createdAt),
    check("appeals_reason_length", sql`char_length(${t.reason}) <= 1000`),
  ]
);
