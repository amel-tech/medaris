import {
  and,
  eq,
  exists,
  gt,
  inArray,
  isNotNull,
  isNull,
  ne,
  notExists,
  notInArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { type AnyPgColumn, alias } from "drizzle-orm/pg-core";
import type { Tx } from "../../course/course-purge";
import { isHeld } from "../../database/role-assignments";
import { courses } from "../../database/schema/course.schema";
import { permissionGrants } from "../../database/schema/permission.schema";
import {
  roleAssignments,
  SCOPE_TYPES,
  type ScopeType,
} from "../../database/schema/role-assignment.schema";
import { grantHeld } from "../assignment.repository";
import { DismissSeatHandedOnError } from "./errors";

/** The scope a seat was held in: its grants are the ones in this scope and the courses below it. */
export interface ISeatScope {
  scopeType: ScopeType;
  scopeId: string | null;
}

/** The grants held in a seat's scope and in the courses below it; null for a scope with no tree of its own. */
function inTreeOf(seat: ISeatScope): SQL | null {
  if (seat.scopeId === null) return null;
  const at = and(
    eq(permissionGrants.scopeType, seat.scopeType),
    eq(permissionGrants.scopeId, seat.scopeId)
  ) as SQL;
  if (seat.scopeType === SCOPE_TYPES.COURSE) return at;
  const parent =
    seat.scopeType === SCOPE_TYPES.MADRASAH
      ? courses.madrasahId
      : seat.scopeType === SCOPE_TYPES.KOSK
        ? courses.koskId
        : null;
  if (!parent) return null;
  return or(
    at,
    and(
      eq(permissionGrants.scopeType, SCOPE_TYPES.COURSE),
      inArray(
        permissionGrants.scopeId,
        sql`(select ${courses.id} from ${courses} where ${eq(parent, seat.scopeId)})`
      )
    )
  ) as SQL;
}

/**
 * A role the grant's holder still holds below the platform, at the grant's own
 * scope or, for a course, at the medrese or the köşk it sits in. A platform
 * role does not count: the engine lets it cover everything, which is exactly
 * how a seat's leftovers would come back the day the person is made a Medaris
 * nazımı.
 */
function coveringRole(tx: Tx) {
  return tx
    .select({ one: sql`1` })
    .from(roleAssignments)
    .where(
      and(
        eq(roleAssignments.userId, permissionGrants.userId),
        isHeld(),
        ne(roleAssignments.scopeType, SCOPE_TYPES.PLATFORM),
        or(
          and(
            eq(roleAssignments.scopeType, permissionGrants.scopeType),
            eq(roleAssignments.scopeId, permissionGrants.scopeId)
          ),
          and(
            eq(permissionGrants.scopeType, SCOPE_TYPES.COURSE),
            exists(
              tx
                .select({ one: sql`1` })
                .from(courses)
                .where(
                  and(
                    eq(courses.id, permissionGrants.scopeId),
                    or(
                      and(
                        eq(roleAssignments.scopeType, SCOPE_TYPES.MADRASAH),
                        eq(roleAssignments.scopeId, courses.madrasahId)
                      ),
                      and(
                        eq(roleAssignments.scopeType, SCOPE_TYPES.KOSK),
                        eq(roleAssignments.scopeId, courses.koskId)
                      )
                    )
                  )
                )
            )
          )
        )
      )
    );
}

/**
 * A permission cannot outlast its role (owner, 3 October; MDRS-135 d-1004).
 * Revokes, in `revokedBy`'s name, the grants `userId` still holds in the seat's
 * scope tree (or, with `anywhere`, in any köşk, medrese or course) that no role
 * of theirs below the platform covers any more. Run after the seat itself is
 * revoked, inside the same transaction; `keep` names grants the remover chose
 * to take over in the same act, which stay. Returns the ids revoked, for the
 * act's audit row.
 *
 * The platform's own grants and the "every course" ones are never touched:
 * they hang on the Medaris nazımı's platform seat, which has its own dismissal.
 */
export async function revokeOrphanedGrants(
  tx: Tx,
  input: {
    userId: string;
    within: ISeatScope | "anywhere";
    revokedBy: string;
    keep?: readonly string[];
  }
): Promise<string[]> {
  const where =
    input.within === "anywhere"
      ? and(
          inArray(permissionGrants.scopeType, [
            SCOPE_TYPES.KOSK,
            SCOPE_TYPES.MADRASAH,
            SCOPE_TYPES.COURSE,
          ]),
          isNotNull(permissionGrants.scopeId)
        )
      : inTreeOf(input.within);
  if (!where) return [];
  const revoked = await tx
    .update(permissionGrants)
    .set({ revokedAt: sql`now()`, revokedBy: input.revokedBy })
    .where(
      and(
        eq(permissionGrants.userId, input.userId),
        grantHeld(),
        where,
        input.keep && input.keep.length > 0
          ? notInArray(permissionGrants.id, [...input.keep])
          : undefined,
        notExists(coveringRole(tx))
      )
    )
    .returning({ id: permissionGrants.id });
  return revoked.map((r) => r.id);
}

/** Rows held in a seat's scope and the courses below it, on any table's scope columns; null for a scope with no tree. */
function inTreeOfColumns(
  seat: ISeatScope,
  type: AnyPgColumn,
  id: AnyPgColumn
): SQL | null {
  if (seat.scopeId === null) return null;
  const at = and(eq(type, seat.scopeType), eq(id, seat.scopeId)) as SQL;
  if (seat.scopeType === SCOPE_TYPES.COURSE) return at;
  const parent =
    seat.scopeType === SCOPE_TYPES.MADRASAH
      ? courses.madrasahId
      : seat.scopeType === SCOPE_TYPES.KOSK
        ? courses.koskId
        : null;
  if (!parent) return null;
  return or(
    at,
    and(
      eq(type, SCOPE_TYPES.COURSE),
      inArray(
        id,
        sql`(select ${courses.id} from ${courses} where ${eq(parent, seat.scopeId)})`
      )
    )
  ) as SQL;
}

/**
 * A role `giverId` still holds that backs a row held at the scope in `type` and
 * `id`: the platform, the same scope, or for a course its köşk or medrese. What
 * a person gave under a seat they keep is not left without a giver.
 */
function backedBy(tx: Tx, giverId: string, type: AnyPgColumn, id: AnyPgColumn) {
  const backing = alias(roleAssignments, "backing");
  return tx
    .select({ one: sql`1` })
    .from(backing)
    .where(
      and(
        eq(backing.userId, giverId),
        isNull(backing.revokedAt),
        or(isNull(backing.expiresAt), gt(backing.expiresAt, sql`now()`)),
        or(
          eq(backing.scopeType, SCOPE_TYPES.PLATFORM),
          and(eq(backing.scopeType, type), eq(backing.scopeId, id)),
          and(
            eq(type, SCOPE_TYPES.COURSE),
            exists(
              tx
                .select({ one: sql`1` })
                .from(courses)
                .where(
                  and(
                    eq(courses.id, id),
                    or(
                      and(
                        eq(backing.scopeType, SCOPE_TYPES.MADRASAH),
                        eq(backing.scopeId, courses.madrasahId)
                      ),
                      and(
                        eq(backing.scopeType, SCOPE_TYPES.KOSK),
                        eq(backing.scopeId, courses.koskId)
                      )
                    )
                  )
                )
            )
          )
        )
      )
    );
}

/**
 * What `giverId` handed on in a seat's scope tree that is still held by
 * someone else and that no role they still hold backs (owner, d-1004: a
 * permission cannot outlast its role, and whoever loses a role, the remover
 * decides each row they gave). Asked at the end of an act that drops seats,
 * after every write: anything here was given under a seat this act took and
 * was asked about by no one, so the act is refused (`DismissSeatHandedOnError`).
 */
export async function handedOnUnder(
  tx: Tx,
  input: { giverId: string; within: ISeatScope }
): Promise<string[]> {
  const roleTree = inTreeOfColumns(
    input.within,
    roleAssignments.scopeType,
    roleAssignments.scopeId
  );
  const grantTree = inTreeOfColumns(
    input.within,
    permissionGrants.scopeType,
    permissionGrants.scopeId
  );
  if (!roleTree || !grantTree) return [];
  const roles = await tx
    .select({ id: roleAssignments.id })
    .from(roleAssignments)
    .where(
      and(
        eq(roleAssignments.grantedBy, input.giverId),
        ne(roleAssignments.userId, input.giverId),
        isHeld(),
        roleTree,
        notExists(
          backedBy(
            tx,
            input.giverId,
            roleAssignments.scopeType,
            roleAssignments.scopeId
          )
        )
      )
    );
  const grants = await tx
    .select({ id: permissionGrants.id })
    .from(permissionGrants)
    .where(
      and(
        eq(permissionGrants.grantedBy, input.giverId),
        ne(permissionGrants.userId, input.giverId),
        grantHeld(),
        grantTree,
        notExists(
          backedBy(
            tx,
            input.giverId,
            permissionGrants.scopeType,
            permissionGrants.scopeId
          )
        )
      )
    );
  return [...roles, ...grants].map((row) => row.id);
}

/**
 * Refuses the act (`DismissSeatHandedOnError`) when any of these dropped seats
 * leaves behind something its holder handed on under it (`handedOnUnder`).
 */
export async function assertNothingLeftUnder(
  tx: Tx,
  droppedSeats: ReadonlyArray<{
    userId: string;
    scopeType: ScopeType;
    scopeId: string | null;
  }>
): Promise<void> {
  const holders: string[] = [];
  for (const seat of droppedSeats) {
    if (holders.includes(seat.userId)) continue;
    const left = await handedOnUnder(tx, {
      giverId: seat.userId,
      within: { scopeType: seat.scopeType, scopeId: seat.scopeId },
    });
    if (left.length > 0) holders.push(seat.userId);
  }
  if (holders.length > 0) throw new DismissSeatHandedOnError(holders);
}
