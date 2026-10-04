import {
  and,
  Column,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  ne,
  or,
  SQL,
  sql,
} from "drizzle-orm";
import type { Tx } from "../course/course-purge";
import { courseMuderris } from "./schema/course.schema";
import {
  ASSIGNED_ROLES,
  AssignedRole,
  ROLE_SCOPE_TYPES,
  roleAssignments,
  ScopeType,
} from "./schema/role-assignment.schema";

/**
 * Reading and writing `role_assignments` (MDRS-134). Every repository that
 * asks "who holds this role here" goes through these, so what "held" means is
 * written once.
 */

/**
 * A row is held while it is neither revoked nor expired. Expiry is checked
 * against the database clock at the moment of the query, so a lapsed role
 * stops counting without anyone touching the row (MDRS-135 relies on this).
 */
export function isHeld(): SQL {
  return and(
    isNull(roleAssignments.revokedAt),
    or(
      isNull(roleAssignments.expiresAt),
      gt(roleAssignments.expiresAt, sql`now()`)
    )
  ) as SQL;
}

/**
 * Rows of `role` held in the scope `scopeId`. `scopeId` may be a column or an
 * expression, for correlated subqueries (`"kosks"."id"`).
 */
export function holdsIn(
  role: AssignedRole,
  scopeId: string | Column | SQL
): SQL {
  return and(
    eq(roleAssignments.role, role),
    eq(roleAssignments.scopeId, scopeId),
    isHeld()
  ) as SQL;
}

/**
 * Whether the scope is passive (MDRS-136): `role` was held in it once and
 * nobody holds it now. A scope that never had one is new, not passive. As a
 * correlated condition for a query: `scopeId` is a column or an expression of
 * the outer row. The engine reads the same fact for a single resource
 * (`TedrisatAuthzContext.managerStats`); a list that hands out content has to
 * read it too.
 */
export function isPassiveScope(
  role: AssignedRole,
  scopeId: string | Column | SQL
): SQL {
  return sql`(exists (select 1 from ${roleAssignments} where ${and(
    eq(roleAssignments.role, role),
    eq(roleAssignments.scopeId, scopeId)
  )}) and not exists (select 1 from ${roleAssignments} where ${holdsIn(
    role,
    scopeId
  )}))`;
}

/**
 * The ids of the users who hold `role` in the scope, oldest grant first, as a
 * correlated subquery for a select list. `::text` so node-postgres parses the
 * array; it has no parser for uuid[] and would hand back the literal "{…}".
 */
export function holderIdsOf(role: AssignedRole, scopeId: SQL): SQL<string[]> {
  return sql<
    string[]
  >`coalesce((select array_agg(${roleAssignments.userId}::text order by ${roleAssignments.createdAt}, ${roleAssignments.userId}) from ${roleAssignments} where ${holdsIn(role, scopeId)}), '{}')`;
}

/** Who is granting a role, and to whom. */
export interface IRoleGrant {
  userId: string;
  role: AssignedRole;
  scopeId: string;
  grantedBy: string;
  isImam?: boolean;
  /** When the post ends (nizam/21's "Görev bitişi"); omitted: until revoked. */
  expiresAt?: Date | null;
}

/**
 * Grants `role` in the scope unless the user already holds it there, inside
 * the caller's transaction. A row that lapsed by `expires_at` but was never
 * revoked is revoked first, in the granter's name: the unique index that
 * allows one open row per person, role and scope cannot see the clock.
 */
export async function grantRole(tx: Tx, grant: IRoleGrant): Promise<void> {
  const sameSeat = and(
    eq(roleAssignments.userId, grant.userId),
    eq(roleAssignments.role, grant.role),
    eq(roleAssignments.scopeId, grant.scopeId),
    isNull(roleAssignments.revokedAt)
  );
  await tx
    .update(roleAssignments)
    .set({ revokedAt: sql`now()`, revokedBy: grant.grantedBy })
    .where(and(sameSeat, lte(roleAssignments.expiresAt, sql`now()`)));
  await tx
    .insert(roleAssignments)
    .values({
      userId: grant.userId,
      role: grant.role,
      scopeType: ROLE_SCOPE_TYPES[grant.role],
      scopeId: grant.scopeId,
      grantedBy: grant.grantedBy,
      isImam: grant.isImam ?? false,
      expiresAt: grant.expiresAt ?? null,
    })
    .onConflictDoNothing();
}

/**
 * Revokes `role` in the scope from the user, in `revokedBy`'s name — a lapsed
 * row that was never revoked too, so that no open row is left behind. True
 * if there was one.
 */
export async function revokeRole(
  tx: Tx,
  revoke: {
    userId: string;
    role: AssignedRole;
    scopeId: string;
    revokedBy: string;
  }
): Promise<boolean> {
  const revoked = await tx
    .update(roleAssignments)
    .set({ revokedAt: sql`now()`, revokedBy: revoke.revokedBy })
    .where(
      and(
        eq(roleAssignments.userId, revoke.userId),
        eq(roleAssignments.role, revoke.role),
        eq(roleAssignments.scopeId, revoke.scopeId),
        isNull(roleAssignments.revokedAt)
      )
    )
    .returning({ id: roleAssignments.id });
  return revoked.length > 0;
}

/**
 * SYSTEM_ADMIN's real delete of scopes (MDRS-124): every assignment row in
 * them, history included, goes with them — `scope_id` is no foreign key, so
 * nothing cascades. Returns the users who held a role there when it went, for
 * the audit entry.
 */
export async function deleteAssignmentsIn(
  tx: Tx,
  scopeType: ScopeType,
  scopeIds: string[]
): Promise<string[]> {
  // An empty `scopeIds` is `where false` (drizzle's `inArray`): no rows.
  const removed = await tx
    .delete(roleAssignments)
    .where(
      and(
        eq(roleAssignments.scopeType, scopeType),
        inArray(roleAssignments.scopeId, scopeIds)
      )
    )
    .returning({
      userId: roleAssignments.userId,
      revokedAt: roleAssignments.revokedAt,
    });
  return removed.filter((r) => r.revokedAt === null).map((r) => r.userId);
}

/**
 * Brings a course's MUDERRIS rows in line with the accounts its
 * `course_muderris` list is bound to, inside the caller's transaction, after
 * that list was written (course create and whole-course PUT).
 *
 * `course_muderris` is what the course page shows; `role_assignments` is what
 * authorization reads (MDRS-134). A bound account that holds no MUDERRIS row
 * is granted one in `actorId`'s name, and a MUDERRIS whose account is no
 * longer on the list is revoked in it.
 *
 * The imam (MDRS-133) stays who they are while they remain a müderris. A
 * course left without one — the first save, or the imam was removed — gets
 * the account listed first. Choosing the imam deliberately is MDRS-136's.
 */
export async function syncMuderrisAssignments(
  tx: Tx,
  courseId: string,
  actorId: string
): Promise<void> {
  const listed = await tx
    .select({
      userId: courseMuderris.userId,
      orderIndex: courseMuderris.orderIndex,
    })
    .from(courseMuderris)
    .where(eq(courseMuderris.courseId, courseId))
    .orderBy(courseMuderris.orderIndex, courseMuderris.id);
  const bound: string[] = [];
  for (const row of listed) {
    if (row.userId !== null && !bound.includes(row.userId)) {
      bound.push(row.userId);
    }
  }

  const course = and(
    eq(roleAssignments.role, ASSIGNED_ROLES.MUDERRIS),
    eq(roleAssignments.scopeId, courseId),
    isNull(roleAssignments.revokedAt)
  );
  // Rows that lapsed by `expires_at` are closed first, in the actor's name:
  // a lapsed imam is no imam, and its open row would otherwise hold the
  // one-imam index against the one chosen below.
  await tx
    .update(roleAssignments)
    .set({ revokedAt: sql`now()`, revokedBy: actorId })
    .where(and(course, lte(roleAssignments.expiresAt, sql`now()`)));

  const open = await tx
    .select({
      userId: roleAssignments.userId,
      isImam: roleAssignments.isImam,
    })
    .from(roleAssignments)
    .where(course);

  for (const row of open) {
    if (!bound.includes(row.userId)) {
      await revokeRole(tx, {
        userId: row.userId,
        role: ASSIGNED_ROLES.MUDERRIS,
        scopeId: courseId,
        revokedBy: actorId,
      });
    }
  }

  const imamStays = open.some((r) => r.isImam && bound.includes(r.userId));
  for (const [i, userId] of bound.entries()) {
    await grantRole(tx, {
      userId,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: courseId,
      grantedBy: actorId,
    });
    if (i === 0 && !imamStays) {
      await tx
        .update(roleAssignments)
        .set({ isImam: true })
        .where(
          and(
            eq(roleAssignments.userId, userId),
            holdsIn(ASSIGNED_ROLES.MUDERRIS, courseId)
          )
        );
    }
  }
}

/**
 * Makes `userId` the course's imam (MDRS-186, nazir/08 and nazir/17), inside
 * the caller's transaction, for a müderris who already holds MUDERRIS there.
 * Whoever held the imam flag lets go of it first: the database allows one imam
 * per course.
 */
export async function setCourseImam(
  tx: Tx,
  courseId: string,
  userId: string
): Promise<void> {
  const course = and(
    eq(roleAssignments.role, ASSIGNED_ROLES.MUDERRIS),
    eq(roleAssignments.scopeId, courseId),
    isNull(roleAssignments.revokedAt)
  );
  await tx
    .update(roleAssignments)
    .set({ isImam: false })
    .where(
      and(
        course,
        eq(roleAssignments.isImam, true),
        ne(roleAssignments.userId, userId)
      )
    );
  await tx
    .update(roleAssignments)
    .set({ isImam: true })
    .where(and(course, eq(roleAssignments.userId, userId)));
}
