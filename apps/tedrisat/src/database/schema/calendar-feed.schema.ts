import { pgTable as table, text, timestamp, uuid } from "drizzle-orm/pg-core";

// One personal calendar-feed secret per user (MDRS-120). A calendar app
// cannot sign in with Keycloak, so the feed URL itself carries the secret;
// only its SHA-256 is stored, so a copy of this table does not hand out
// anyone's feed. Regenerating overwrites the row, which is what makes the old
// URL stop working. `user_id` is the Keycloak `sub` and, like every other
// user column, not a foreign key.
export const calendarFeedTokens = table("calendar_feed_tokens", {
  userId: uuid("user_id").primaryKey(),
  // Hex SHA-256 of the token. Unique, which also indexes the one lookup the
  // feed route makes.
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
