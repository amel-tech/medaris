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
import { scopeType } from "./role-assignment.schema";

/**
 * Permission groups and grants (MDRS-169). A role carries a default set of
 * permissions (`permission/permission-catalog.ts`); a group is a named set of
 * catalog codes that someone who holds a role may define in their own scope,
 * and a grant gives one permission, or one group, to one person in one scope.
 *
 * Nothing here is a foreign key to a köşk, a medrese or a course, for the
 * reason `role_assignments.scope_id` is not one: the id points at a different
 * table per `scope_type`. User columns follow the rule of every other table:
 * users rows are written lazily on sign-in (MDRS-104).
 */
export const permissionGroups = table(
  "permission_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scopeType: scopeType("scope_type").notNull(),
    scopeId: uuid("scope_id"),
    name: text("name").notNull(),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("permission_groups_scope_idx").on(t.scopeType, t.scopeId),
    // Platform groups carry no scope id; köşk and medrese groups must; a
    // course group may name one course or, without an id, every course.
    check(
      "permission_groups_scope_id_present",
      sql`(${t.scopeType} = 'platform' and ${t.scopeId} is null) or (${t.scopeType} in ('kosk', 'madrasah') and ${t.scopeId} is not null) or ${t.scopeType} = 'course'`
    ),
    // A name is used once among the live groups no scope id narrows (the
    // platform's and every-course ones), whatever its case (MDRS-171).
    uniqueIndex("permission_groups_name_idx")
      .on(sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} is null and ${t.scopeId} is null`),
  ]
);

/** The catalog codes a group holds. The code is checked in the service. */
export const permissionGroupItems = table(
  "permission_group_items",
  {
    groupId: uuid("group_id")
      .references(() => permissionGroups.id, { onDelete: "cascade" })
      .notNull(),
    permission: text("permission").notNull(),
  },
  (t) => [
    uniqueIndex("permission_group_items_unique_idx").on(
      t.groupId,
      t.permission
    ),
  ]
);

/**
 * One permission or one group, given to one person in one scope. Held while
 * `revoked_at` is null and `expires_at` has not passed, like a role
 * assignment; revoked rows stay as history.
 */
export const permissionGrants = table(
  "permission_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    scopeType: scopeType("scope_type").notNull(),
    scopeId: uuid("scope_id"),
    permission: text("permission"),
    groupId: uuid("group_id").references(() => permissionGroups.id, {
      onDelete: "restrict",
    }),
    grantedBy: uuid("granted_by").notNull(),
    // The level of the authority the giver acted under when they made the grant
    // (MDRS-135): the başnazım and a Medaris nazımı act as `platform`, a köşk
    // nazımı as `kosk`, a başmüderris as `madrasah`, a müderris as `course`. A
    // grant made from above a policy's level survives that policy. Null on
    // rows that predate the column: they count as made at their own scope.
    authorityScopeType: scopeType("authority_scope_type"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by"),
  },
  (t) => [
    index("permission_grants_user_idx").on(t.userId),
    index("permission_grants_group_idx").on(t.groupId),
    check(
      "permission_grants_permission_xor_group",
      sql`(${t.permission} is null) <> (${t.groupId} is null)`
    ),
    // A course grant without an id is held in every course (MDRS-171).
    check(
      "permission_grants_scope_id_present",
      sql`(${t.scopeType} = 'platform' and ${t.scopeId} is null) or (${t.scopeType} in ('kosk', 'madrasah') and ${t.scopeId} is not null) or ${t.scopeType} = 'course'`
    ),
    check(
      "permission_grants_revocation_complete",
      sql`(${t.revokedAt} is null) = (${t.revokedBy} is null)`
    ),
  ]
);
