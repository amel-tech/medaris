import {
  boolean,
  pgTable as table,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/** The two switches of nizam/19; the row of a key that was never touched is absent and reads as off. */
export const PLATFORM_POLICY_KEYS = [
  "ALWAYS_REQUIRE_APPROVAL",
  "RECORDINGS_NEVER_PUBLIC",
] as const;
export type PlatformPolicyKey = (typeof PLATFORM_POLICY_KEYS)[number];

// Platform-wide policies (MDRS-181, nizam/19). A policy that is on closes a
// permission for every scope below it: a köşk cannot switch the same rule off.
// `changed_by` is a user column like every other one, not a foreign key.
export const platformPolicies = table("platform_policies", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").default(false).notNull(),
  changedBy: uuid("changed_by"),
  changedAt: timestamp("changed_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
