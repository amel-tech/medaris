import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable as table,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// One row per person who has ever called tedrisat with a valid token
// (MDRS-104). The primary key IS the Keycloak `sub`, so every existing
// `owner_id` / `user_id` column already points at it without a migration.
// Keycloak stays the source of truth for the identity: `email` and the names
// are refreshed from the token by `UserSyncInterceptor`; only `time_zone`,
// `locale` and `lesson_invitation_emails` are the user's own settings,
// written by `PATCH /me`.
//
// What is stored here must match the privacy notice (MDRS-102) — see
// docs/migration/mdrs-104-users-table.md.
export const users = table(
  "users",
  {
    id: uuid("id").primaryKey(),
    // Nullable: a Keycloak account need not carry an e-mail address.
    email: text("email"),
    emailVerified: boolean("email_verified").default(false).notNull(),
    givenName: text("given_name"),
    familyName: text("family_name"),
    // IANA zone, e.g. "Europe/Istanbul" (MDRS-110).
    timeZone: text("time_zone"),
    // BCP 47 tag, e.g. "tr".
    locale: text("locale"),
    // Lesson invitations by e-mail (MDRS-121), the user's own setting like
    // the two above. On unless they turned it off on Hesap; off stops every
    // further invitation, update and cancellation to this address.
    lessonInvitationEmails: boolean("lesson_invitation_emails")
      .default(true)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  // `GET /users?email=` compares case-insensitively; an index on the
  // expression is what that predicate can use. Not unique: Keycloak can hand
  // an address to a second account before the first one's row is refreshed.
  (t) => [index("users_email_lower_idx").on(sql`lower(${t.email})`)]
);
