import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgEnum,
  smallint,
  pgTable as table,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const BAN_SCOPES = {
  COURSE: "COURSE",
  KOSK: "KOSK",
} as const;
export type BanScope = (typeof BAN_SCOPES)[keyof typeof BAN_SCOPES];

export const banScope = pgEnum("ban_scope", [
  BAN_SCOPES.COURSE,
  BAN_SCOPES.KOSK,
]);

// A talebe barred from one course or from a whole köşk (MDRS-177, screens
// nizam/41 and nizam/42). The row is the ban: it is lifted, never deleted, so
// who barred, who lifted and why both stay on record.
//
// `kosk_id` is always set. `course_id` is set for a COURSE ban and null for a
// KOSK ban; `extended_from_course_id` names the course a KOSK ban was widened
// from, when it was ("Emsile ve Bina'dan genişletildi"). None of the three is
// a foreign key, like `role_assignments.scope_id`: the row is a record that
// outlives the scope it names, and SYSTEM_ADMIN's real delete of a köşk or a
// course need not know about it. `user_id`, `banned_by` and `lifted_by` are
// user columns like every other and not foreign keys either.
//
// `banned_tier` is what decides who may lift (see `ban/ban-tier.ts`): the
// rank of the role the banner acted in, written once when the ban is made.
// `banned_role` is that role's name, for the "Müderris" line under the name.
// `reason` is the banner's, read by whoever may lift; it is never returned to
// the talebe.
export const bans = table(
  "bans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    koskId: uuid("kosk_id").notNull(),
    courseId: uuid("course_id"),
    scope: banScope().notNull(),
    extendedFromCourseId: uuid("extended_from_course_id"),
    reason: text("reason").notNull(),
    bannedBy: uuid("banned_by").notNull(),
    bannedRole: text("banned_role").notNull(),
    bannedTier: smallint("banned_tier").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    liftedAt: timestamp("lifted_at", { withTimezone: true }),
    liftedBy: uuid("lifted_by"),
    liftReason: text("lift_reason"),
  },
  (t) => [
    // At most one open ban per person and scope; the second request is the
    // first one again (idempotent), not a second row.
    uniqueIndex("bans_open_course_uq")
      .on(t.userId, t.courseId)
      .where(sql`${t.liftedAt} is null and ${t.scope} = 'COURSE'`),
    uniqueIndex("bans_open_kosk_uq")
      .on(t.userId, t.koskId)
      .where(sql`${t.liftedAt} is null and ${t.scope} = 'KOSK'`),
    // The köşk's list: open or lifted, newest first.
    index("bans_kosk_created_idx").on(t.koskId, t.createdAt.desc()),
    check(
      "bans_scope_matches_course",
      sql`(${t.scope} = 'COURSE') = (${t.courseId} is not null)`
    ),
    check(
      "bans_lift_complete",
      sql`(${t.liftedAt} is null) = (${t.liftedBy} is null)`
    ),
    check("bans_tier_range", sql`${t.bannedTier} between 1 and 4`),
  ]
);
