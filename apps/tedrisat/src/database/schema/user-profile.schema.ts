import { sql } from "drizzle-orm";
import {
  boolean,
  pgTable as table,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const PROFILE_GENDERS = ["FEMALE", "MALE"] as const;
export type ProfileGender = (typeof PROFILE_GENDERS)[number];

// What a person says about themselves in Medaris (MDRS-166, screens tedris/34
// and tedris/35). `users` keeps what Keycloak says and is overwritten from the
// token; this row keeps what the person typed, so a token refresh can never
// undo it. `user_id` is the Keycloak `sub` and, like every other user column,
// not a foreign key.
//
// `given_name` / `family_name` are the names the person entered on Hesap. They
// win over the token's names in `GET /me`; null means "use the token's".
//
// `kunye` (ilmî künye) and `gender` are always public. Every other field is
// public only while its `show_*` switch is on; all four switches default to
// off, so a new row shows nothing but the künye.
export const userProfiles = table(
  "user_profiles",
  {
    userId: uuid("user_id").primaryKey(),
    givenName: text("given_name"),
    familyName: text("family_name"),
    kunye: text("kunye"),
    gender: text("gender"),
    city: text("city"),
    about: text("about"),
    showFullName: boolean("show_full_name").default(false).notNull(),
    showCity: boolean("show_city").default(false).notNull(),
    showAbout: boolean("show_about").default(false).notNull(),
    showCourses: boolean("show_courses").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  // A künye is a handle people recognise each other by, so two cannot differ
  // only in case. Null (not chosen yet) is not a value and never collides.
  (t) => [
    uniqueIndex("user_profiles_kunye_lower_idx")
      .on(sql`lower(${t.kunye})`)
      .where(sql`${t.kunye} is not null`),
  ]
);
