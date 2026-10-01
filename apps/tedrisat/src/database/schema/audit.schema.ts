import {
  jsonb,
  pgTable as table,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// What SYSTEM_ADMIN deleted for real, and everything that went with it
// (MDRS-124). Deletion is the one action nobody can undo, so it leaves a row
// here in the same transaction that removes the data. No foreign keys: the
// row outlives the thing it describes by design, and `actor_id` is a user
// column like every other one (users rows are written lazily, MDRS-104).
export const auditLog = table("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").notNull(),
  // `<entity>.<verb>`, e.g. `course.delete`.
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: uuid("entity_id").notNull(),
  // What was removed: the row's name and a count per child table.
  details: jsonb("details").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
