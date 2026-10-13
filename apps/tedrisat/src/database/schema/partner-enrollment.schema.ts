import {
  boolean,
  index,
  pgTable as table,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { courses } from "./course.schema";

/**
 * A partner application's own code for a course or a weekly activity, mapped
 * to the Medaris course its registrations enrol people in ("Ortak uygulama
 * kodları" in nazar's course settings). A code belongs to one partner and maps
 * to at most one course; a course may carry several codes of the same partner.
 * `partner_client_id` is the partner's Keycloak client id, as
 * `INTEGRATION_PARTNERS` names it. RESTRICT like every foreign key under a
 * course: `course/course-purge.ts` removes these before the course.
 */
export const partnerCourseCodes = table(
  "partner_course_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    partnerClientId: text("partner_client_id").notNull(),
    code: text("code").notNull(),
    courseId: uuid("course_id")
      .references(() => courses.id, { onDelete: "restrict" })
      .notNull(),
    // Who mapped it; a user column like every other one, no foreign key.
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("partner_course_codes_partner_code_uq").on(
      t.partnerClientId,
      t.code
    ),
    index("partner_course_codes_course_id_idx").on(t.courseId),
  ]
);

/**
 * One registration of a partner application for one course code, and the
 * Medaris enrollment it stands for. The partner names it by its own
 * `registration_ref` and `course_code`; it is unique on those with the
 * partner, and stays bound to the person (`user_id`, a Keycloak subject) and
 * the course it was made for, even if the code is later mapped elsewhere.
 *
 * `created_enrollment` says whether the enrollment is this link's to undo: a
 * DELETE from the partner removes only what the integration added. It is true
 * when this link seated the person (a new seat, a waiting request approved, or
 * a seat the integration had taken away given back), false when they were
 * already enrolled on their own or through another link. `enrollment_created_at`
 * is the `created_at` of the enrollment row it owns: a row with another one is
 * a seat the person took again on their own after leaving, and is theirs.
 * `enrollment_removed_at` is the enrollment's `updated_at` right after this
 * link's DELETE took the seat away (REVOKED); while the row still says exactly
 * that, nobody else has touched it, and a new registration may give it back.
 *
 * `closed_at` is set by the DELETE; a closed link answers the same DELETE
 * again with what it did, and a PUT reopens it.
 */
export const partnerEnrollmentLinks = table(
  "partner_enrollment_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    partnerClientId: text("partner_client_id").notNull(),
    registrationRef: text("registration_ref").notNull(),
    courseCode: text("course_code").notNull(),
    courseId: uuid("course_id")
      .references(() => courses.id, { onDelete: "restrict" })
      .notNull(),
    userId: uuid("user_id").notNull(),
    createdEnrollment: boolean("created_enrollment").default(false).notNull(),
    // Same type as `enrollments.created_at` and `.updated_at`, which these
    // copy and are compared with.
    enrollmentCreatedAt: timestamp("enrollment_created_at"),
    enrollmentRemovedAt: timestamp("enrollment_removed_at"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("partner_enrollment_links_partner_ref_code_uq").on(
      t.partnerClientId,
      t.registrationRef,
      t.courseCode
    ),
    // The other links of one person in one course, and the purge.
    index("partner_enrollment_links_course_user_idx").on(t.courseId, t.userId),
  ]
);
