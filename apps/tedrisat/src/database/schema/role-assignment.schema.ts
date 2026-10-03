import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgEnum,
  pgTable as table,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { kosks } from "./kosk.schema";
import { madrasahs } from "./madrasah.schema";
import { SCOPE_TYPES, type ScopeType, scopeType } from "./scope-type.schema";

/**
 * The six scoped roles of role model v2 (MDRS-133, MDRS-134). The Medaris
 * başnazımı is not one of them: it stays the Keycloak `SYSTEM_ADMIN` realm
 * role. Each role lives in exactly one kind of scope — see
 * `ROLE_SCOPE_TYPES` and the `role_assignments_scope_matches_role` check.
 */
export const ASSIGNED_ROLES = {
  MEDARIS_NAZIM: "MEDARIS_NAZIM",
  KOSK_NAZIM: "KOSK_NAZIM",
  MEDRESE_BASMUDERRIS: "MEDRESE_BASMUDERRIS",
  MEDRESE_NAZIR: "MEDRESE_NAZIR",
  MUDERRIS: "MUDERRIS",
  DERS_NAZIR: "DERS_NAZIR",
} as const;
export type AssignedRole = (typeof ASSIGNED_ROLES)[keyof typeof ASSIGNED_ROLES];

export { SCOPE_TYPES, type ScopeType, scopeType };

export const ROLE_SCOPE_TYPES: Record<AssignedRole, ScopeType> = {
  MEDARIS_NAZIM: SCOPE_TYPES.PLATFORM,
  KOSK_NAZIM: SCOPE_TYPES.KOSK,
  MEDRESE_BASMUDERRIS: SCOPE_TYPES.MADRASAH,
  MEDRESE_NAZIR: SCOPE_TYPES.MADRASAH,
  MUDERRIS: SCOPE_TYPES.COURSE,
  DERS_NAZIR: SCOPE_TYPES.COURSE,
};

export const assignedRole = pgEnum("assigned_role", [
  ASSIGNED_ROLES.MEDARIS_NAZIM,
  ASSIGNED_ROLES.KOSK_NAZIM,
  ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
  ASSIGNED_ROLES.MEDRESE_NAZIR,
  ASSIGNED_ROLES.MUDERRIS,
  ASSIGNED_ROLES.DERS_NAZIR,
]);

/**
 * Who holds which role where (MDRS-134). Replaces `kosk_managers` and
 * `madrasah_nazirs`, and carries the account side of `course_muderris`, which
 * stays for what a course page shows (name, title, bio).
 *
 * A row is held while `revoked_at` is null and `expires_at` has not passed;
 * `activeAssignment` in `role-assignments.ts` is the one place that says so.
 * Rows are revoked, not deleted, so who granted and who took away stays on
 * record. Only SYSTEM_ADMIN's real delete of a scope removes its rows.
 *
 * `scope_id` is not a foreign key: it points at a köşk, a medrese or a course
 * depending on `scope_type`. `user_id`, `granted_by` and `revoked_by` are not
 * either, for the reason `madrasahs.created_by` gives: users rows are written
 * lazily on sign-in (MDRS-104).
 */
export const roleAssignments = table(
  "role_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    role: assignedRole().notNull(),
    scopeType: scopeType("scope_type").notNull(),
    scopeId: uuid("scope_id"),
    // The course's imam among its müderrisler (MDRS-133). Only on MUDERRIS
    // rows; at most one held row per course (the partial unique index below).
    isImam: boolean("is_imam").default(false).notNull(),
    grantedBy: uuid("granted_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by"),
  },
  (t) => [
    // A person holds a role in a scope once at a time. Revoked rows are
    // history and may repeat. Two indexes because `scope_id` is null for the
    // platform, and nulls never collide in a plain unique index.
    uniqueIndex("role_assignments_held_scoped_idx")
      .on(t.userId, t.role, t.scopeId)
      .where(sql`${t.revokedAt} is null and ${t.scopeId} is not null`),
    uniqueIndex("role_assignments_held_platform_idx")
      .on(t.userId, t.role)
      .where(sql`${t.revokedAt} is null and ${t.scopeId} is null`),
    // "Who holds this role here" — a köşk's nazımları, a course's müderrisler.
    index("role_assignments_scope_idx").on(t.scopeId, t.role),
    // Exactly one imam per course: the database refuses a second.
    uniqueIndex("role_assignments_one_imam_per_course_idx")
      .on(t.scopeId)
      .where(sql`${t.isImam} and ${t.revokedAt} is null`),
    check(
      "role_assignments_scope_matches_role",
      sql`(${t.role} = 'MEDARIS_NAZIM' and ${t.scopeType} = 'platform')
        or (${t.role} = 'KOSK_NAZIM' and ${t.scopeType} = 'kosk')
        or (${t.role} in ('MEDRESE_BASMUDERRIS', 'MEDRESE_NAZIR') and ${t.scopeType} = 'madrasah')
        or (${t.role} in ('MUDERRIS', 'DERS_NAZIR') and ${t.scopeType} = 'course')`
    ),
    check(
      "role_assignments_scope_id_present",
      sql`(${t.scopeType} = 'platform') = (${t.scopeId} is null)`
    ),
    check(
      "role_assignments_imam_is_muderris",
      sql`not ${t.isImam} or ${t.role} = 'MUDERRIS'`
    ),
    check(
      "role_assignments_revocation_complete",
      sql`(${t.revokedAt} is null) = (${t.revokedBy} is null)`
    ),
  ]
);

/**
 * "This medrese may open courses in this köşk" (MDRS-133, MDRS-134). The only
 * link between a medrese and a köşk; it gives the medrese no power over the
 * köşk. Replaces `kosks.madrasah_id`. MDRS-137 builds the grant and revoke
 * flows. Revoked rows stay as history, so the key is a surrogate id and a
 * pair is held once at a time (the partial unique index).
 */
export const madrasahKoskHosting = table(
  "madrasah_kosk_hosting",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    madrasahId: uuid("madrasah_id")
      .references(() => madrasahs.id, { onDelete: "cascade" })
      .notNull(),
    koskId: uuid("kosk_id")
      .references(() => kosks.id, { onDelete: "cascade" })
      .notNull(),
    grantedBy: uuid("granted_by").notNull(),
    // How the granter was entitled to grant — `SYSTEM_ADMIN` (a realm role,
    // stored nowhere else) or `KOSK_NAZIM` — so nizam/26's "Veren" column can
    // name the role without guessing. Null on rows older than MDRS-170.
    grantedByRole: text("granted_by_role"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by"),
  },
  (t) => [
    uniqueIndex("madrasah_kosk_hosting_held_idx")
      .on(t.madrasahId, t.koskId)
      .where(sql`${t.revokedAt} is null`),
    // "Which medreses may open courses here" — the köşk-side list.
    index("madrasah_kosk_hosting_kosk_id_idx").on(t.koskId),
    check(
      "madrasah_kosk_hosting_revocation_complete",
      sql`(${t.revokedAt} is null) = (${t.revokedBy} is null)`
    ),
  ]
);
