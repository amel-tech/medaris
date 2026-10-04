import {
  boolean,
  integer,
  pgTable as table,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { scopeType } from "./scope-type.schema";

// Medrese = the optional top layer of the hierarchy (PRD §4.1, ADR-003). It
// lives in tedrisat, beside `kosks` and the authorization resolver, until a
// separate decision moves it to teskilat (MDRS-106).
//
// Since MDRS-134 it has no link to a köşk except a hosting right
// (`madrasah_kosk_hosting`), and who governs it is `role_assignments`
// (MEDRESE_BASMUDERRIS, MEDRESE_NAZIR) — `madrasah_nazirs` is gone.
export const madrasahs = table("madrasahs", {
  id: uuid("id").primaryKey().defaultRandom(),
  handle: text("handle").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  coverHue: integer("cover_hue").default(215).notNull(),
  // The SYSTEM_ADMIN who opened it. Not a foreign key: users rows are
  // written lazily on sign-in (MDRS-104), like every other user column here.
  createdBy: uuid("created_by").notNull(),
  // Passive (MDRS-134): the medrese lost its last admin and nobody above took
  // it over (MDRS-133, MDRS-136). Not hiding (MDRS-124): nobody hid a
  // passive medrese, it is unattended. Null while active.
  passiveSince: timestamp("passive_since", { withTimezone: true }),
  passiveReason: text("passive_reason"),
  // Hidden (MDRS-170): nothing is deleted, the medrese is in no list but
  // SYSTEM_ADMIN's and the same person brings it back (nizam/07 "Geri al").
  // `archivedBy` is the account that hid it — not a foreign key, like every
  // other user column. Null while shown.
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  archivedBy: uuid("archived_by"),
  // The level the hider acted at (MDRS-135): platform, köşk, medrese or course.
  // A restore is by that level or above (the ban rule, "elbette kademe var");
  // null on a row hidden before it was recorded, which counts as the lowest
  // level that could have hidden it. Null while shown.
  archivedLevel: scopeType("archived_level"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// What the medrese's nazırs set on nazir/04, apart from the medrese row so that
// the public reads of `madrasahs` never carry it. A row exists from the first
// save on; a medrese with none has every policy off and no "Son değişiklik".
// Each policy closes a permission in every course of the medrese, and a
// course's own settings cannot reopen it. Only `policy_always_approval` has a
// server effect yet (`CourseService.enroll`); the other two are kept for the
// courses and recordings that will read them. `updated_by` is not a foreign
// key, like every other user column here.
export const madrasahSettings = table("madrasah_settings", {
  madrasahId: uuid("madrasah_id")
    .primaryKey()
    .references(() => madrasahs.id, { onDelete: "cascade" }),
  policyClosedCourseRequired: boolean("policy_closed_course_required")
    .default(false)
    .notNull(),
  policyAlwaysApproval: boolean("policy_always_approval")
    .default(false)
    .notNull(),
  policyNoPublicRecordings: boolean("policy_no_public_recordings")
    .default(false)
    .notNull(),
  // The last save: of the policies, or of the name and description on the
  // medrese row.
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedBy: uuid("updated_by").notNull(),
});
