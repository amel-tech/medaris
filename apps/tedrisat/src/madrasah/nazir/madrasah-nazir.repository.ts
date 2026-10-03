import { Injectable } from "@nestjs/common";
import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { DismissAction } from "../../assignment/admin/dto/permission-admin.dto";
import {
  DismissDecisionsError,
  GrantExpiryInvalidError,
} from "../../assignment/admin/errors";
import {
  checkGrantExpiry,
  type IHeldGrant,
  planGrants,
} from "../../assignment/admin/grant-plan";
import { grantHeld } from "../../assignment/assignment.repository";
import type { Tx } from "../../course/course-purge";
import { DatabaseService } from "../../database/database.service";
import { grantRole, holdsIn, isHeld } from "../../database/role-assignments";
import { auditLog } from "../../database/schema/audit.schema";
import { courses } from "../../database/schema/course.schema";
import { madrasahs } from "../../database/schema/madrasah.schema";
import { permissionGrants } from "../../database/schema/permission.schema";
import {
  ASSIGNED_ROLES,
  type AssignedRole,
  roleAssignments,
  SCOPE_TYPES,
  type ScopeType,
} from "../../database/schema/role-assignment.schema";
import { MadrasahNotFoundError } from "../errors/madrasah-not-found.error";
import { NazirNotFoundError } from "../errors/nazir-not-found.error";
import { type IGivenItem, planDismissal } from "./dismissal-plan";
import type { IHeldTreeGrant, IWantedScope } from "./nazir-grant-scopes";

const NAZIR_ROLE = ASSIGNED_ROLES.MEDRESE_NAZIR;

export interface INazirRole {
  id: string;
  userId: string;
  grantedBy: string;
  createdAt: Date;
  expiresAt: Date | null;
}

export interface INazirGrant {
  userId: string;
  scopeType: ScopeType;
  scopeId: string | null;
  /** The title of the course a course-scoped grant is held in. */
  courseTitle: string | null;
  permission: string | null;
  groupId: string | null;
  grantedBy: string;
  createdAt: Date;
  expiresAt: Date | null;
}

export interface IGivenRow extends IGivenItem {
  role: AssignedRole | null;
  permission: string | null;
  groupId: string | null;
  scopeType: ScopeType;
  scopeId: string | null;
  createdAt: Date;
  expiresAt: Date | null;
}

/**
 * The scopes of a medrese's own tree, as a condition on a scope type and id
 * column: the medrese itself and its courses.
 */
function inMedreseTree(
  db: Tx | DatabaseService["db"],
  madrasahId: string
): (type: AnyPgColumn, id: AnyPgColumn) => SQL {
  const medreseCourses = db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.madrasahId, madrasahId));
  return (type, id) =>
    or(
      and(eq(type, SCOPE_TYPES.MADRASAH), eq(id, madrasahId)),
      and(eq(type, SCOPE_TYPES.COURSE), inArray(id, medreseCourses))
    ) as SQL;
}

/** Reads and writes behind nazir/05, 06 and 15: the medrese's MEDRESE_NAZIR roles and what hangs on them. */
@Injectable()
export class MadrasahNazirRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /** The nazır appointments held in the medrese now, oldest first. */
  async heldRoles(madrasahId: string, userId?: string): Promise<INazirRole[]> {
    return this.db
      .select({
        id: roleAssignments.id,
        userId: roleAssignments.userId,
        grantedBy: roleAssignments.grantedBy,
        createdAt: roleAssignments.createdAt,
        expiresAt: roleAssignments.expiresAt,
      })
      .from(roleAssignments)
      .where(
        and(
          holdsIn(NAZIR_ROLE, madrasahId),
          userId ? eq(roleAssignments.userId, userId) : undefined
        )
      )
      .orderBy(asc(roleAssignments.createdAt), asc(roleAssignments.id));
  }

  /**
   * The permissions and groups these people hold in the medrese and in its
   * courses, oldest first.
   */
  async heldGrants(
    madrasahId: string,
    userIds: string[]
  ): Promise<INazirGrant[]> {
    if (userIds.length === 0) return [];
    return this.db
      .select({
        userId: permissionGrants.userId,
        scopeType: permissionGrants.scopeType,
        scopeId: permissionGrants.scopeId,
        courseTitle: courses.title,
        permission: permissionGrants.permission,
        groupId: permissionGrants.groupId,
        grantedBy: permissionGrants.grantedBy,
        createdAt: permissionGrants.createdAt,
        expiresAt: permissionGrants.expiresAt,
      })
      .from(permissionGrants)
      .leftJoin(
        courses,
        and(
          eq(permissionGrants.scopeType, SCOPE_TYPES.COURSE),
          eq(courses.id, permissionGrants.scopeId)
        )
      )
      .where(
        and(
          inArray(permissionGrants.userId, userIds),
          inMedreseTree(this.db, madrasahId)(
            permissionGrants.scopeType,
            permissionGrants.scopeId
          ),
          grantHeld()
        )
      )
      .orderBy(asc(permissionGrants.createdAt), asc(permissionGrants.id));
  }

  /**
   * Makes `userId` a nazır of the medrese with no permissions. Locks the
   * medrese row first, like `setHeadMuderris`: `scope_id` is no foreign key, so
   * without the lock a grant racing SYSTEM_ADMIN's delete could commit after it
   * and leave a role in a medrese that is gone. Appointing a nazır again
   * changes nothing and writes nothing. False when there is no such medrese.
   */
  async appoint(
    madrasahId: string,
    userId: string,
    actorId: string,
    authority: ScopeType
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [madrasah] = await tx
        .select({ id: madrasahs.id })
        .from(madrasahs)
        .where(eq(madrasahs.id, madrasahId))
        .for("no key update");
      if (!madrasah) return false;
      const held = await tx
        .select({ id: roleAssignments.id })
        .from(roleAssignments)
        .where(
          and(
            eq(roleAssignments.userId, userId),
            holdsIn(NAZIR_ROLE, madrasahId)
          )
        )
        .limit(1);
      if (held.length === 0) {
        await grantRole(tx, {
          userId,
          role: NAZIR_ROLE,
          scopeId: madrasahId,
          grantedBy: actorId,
        });
        // The row the başnazım finds under "what they handed on": its id, who
        // it went to, where, and at which level the giver acted.
        const [seat] = await tx
          .select({ id: roleAssignments.id })
          .from(roleAssignments)
          .where(
            and(
              eq(roleAssignments.userId, userId),
              holdsIn(NAZIR_ROLE, madrasahId)
            )
          )
          .limit(1);
        await tx.insert(auditLog).values({
          actorId,
          action: "madrasah_nazir.appoint",
          entity: "madrasah",
          entityId: madrasahId,
          details: {
            userId,
            role: NAZIR_ROLE,
            roleAssignmentId: seat?.id ?? null,
            scopeType: SCOPE_TYPES.MADRASAH,
            scopeId: madrasahId,
            authority,
          },
        });
      }
      return true;
    });
  }

  /** Which of these are courses of the medrese, hidden ones included. */
  async courseIdsOf(madrasahId: string, ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({ id: courses.id })
      .from(courses)
      .where(and(eq(courses.madrasahId, madrasahId), inArray(courses.id, ids)));
    return rows.map((r) => r.id);
  }

  /** The permissions and groups one person holds in the medrese's tree, oldest first. */
  async heldTreeGrants(
    madrasahId: string,
    userId: string
  ): Promise<IHeldTreeGrant[]> {
    return this.db
      .select({
        scopeType: permissionGrants.scopeType,
        scopeId: permissionGrants.scopeId,
        permission: permissionGrants.permission,
        groupId: permissionGrants.groupId,
        expiresAt: permissionGrants.expiresAt,
      })
      .from(permissionGrants)
      .where(
        and(
          eq(permissionGrants.userId, userId),
          inMedreseTree(this.db, madrasahId)(
            permissionGrants.scopeType,
            permissionGrants.scopeId
          ),
          grantHeld()
        )
      )
      .orderBy(asc(permissionGrants.createdAt), asc(permissionGrants.id));
  }

  /**
   * Replaces what the nazır holds in the medrese and its courses with the
   * scopes wanted (nazir/06's Kaydet), in one transaction with its audit rows.
   * Scope by scope the rows that stay are left alone, so saving the dialog
   * unchanged touches nothing; the rest are revoked in the actor's name or
   * added. `expiresAt` null means "when the appointment ends". Locks the
   * medrese first, like `appoint`, and the appointment, so two saves for one
   * nazır queue.
   */
  async setPermissions(
    madrasahId: string,
    nazirId: string,
    actorId: string,
    wanted: {
      scopes: IWantedScope[];
      expiresAt: Date | null;
      /** The level of the authority the giver acts under (MDRS-135). */
      authority: ScopeType;
    }
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [madrasah] = await tx
        .select({ id: madrasahs.id })
        .from(madrasahs)
        .where(eq(madrasahs.id, madrasahId))
        .for("no key update");
      if (!madrasah) throw new MadrasahNotFoundError(madrasahId);
      const [role] = await tx
        .select({ expiresAt: roleAssignments.expiresAt })
        .from(roleAssignments)
        .where(
          and(
            eq(roleAssignments.userId, nazirId),
            holdsIn(NAZIR_ROLE, madrasahId)
          )
        )
        .for("update")
        .limit(1);
      if (!role) throw new NazirNotFoundError(madrasahId, nazirId);
      const problem = checkGrantExpiry(
        wanted.expiresAt,
        role.expiresAt,
        new Date()
      );
      if (problem === "past") {
        throw new GrantExpiryInvalidError("The end date is in the past");
      }
      if (problem === "after-assignment") {
        throw new GrantExpiryInvalidError(
          "The end date is after the appointment's end"
        );
      }
      const expiresAt = wanted.expiresAt ?? role.expiresAt;

      const held = await tx
        .select({
          id: permissionGrants.id,
          scopeType: permissionGrants.scopeType,
          scopeId: permissionGrants.scopeId,
          permission: permissionGrants.permission,
          groupId: permissionGrants.groupId,
          expiresAt: permissionGrants.expiresAt,
        })
        .from(permissionGrants)
        .where(
          and(
            eq(permissionGrants.userId, nazirId),
            inMedreseTree(tx, madrasahId)(
              permissionGrants.scopeType,
              permissionGrants.scopeId
            ),
            grantHeld()
          )
        )
        .orderBy(asc(permissionGrants.createdAt), asc(permissionGrants.id));

      const keyOf = (scope: { scopeType: ScopeType; scopeId: string | null }) =>
        `${scope.scopeType}:${scope.scopeId}`;
      const scopes = new Map(
        wanted.scopes.map((scope) => [keyOf(scope), scope])
      );
      for (const row of held) {
        if (!scopes.has(keyOf(row))) {
          scopes.set(keyOf(row), {
            scopeType: row.scopeType,
            scopeId: row.scopeId as string,
            groupId: null,
            permissions: [],
          });
        }
      }

      const revoke: string[] = [];
      const retime: string[] = [];
      const insert: Array<{
        scopeType: ScopeType;
        scopeId: string;
        permission: string | null;
        groupId: string | null;
      }> = [];
      for (const [key, scope] of scopes) {
        const plan = planGrants(
          held.filter((row) => keyOf(row) === key) as IHeldGrant[],
          { groupId: scope.groupId, permissions: scope.permissions, expiresAt }
        );
        revoke.push(...plan.revoke);
        retime.push(...plan.retime);
        for (const item of plan.insert) {
          insert.push({
            scopeType: scope.scopeType,
            scopeId: scope.scopeId,
            permission: "permission" in item ? item.permission : null,
            groupId: "groupId" in item ? item.groupId : null,
          });
        }
      }

      if (revoke.length > 0) {
        await tx
          .update(permissionGrants)
          .set({ revokedAt: sql`now()`, revokedBy: actorId })
          .where(inArray(permissionGrants.id, revoke));
      }
      if (retime.length > 0) {
        await tx
          .update(permissionGrants)
          .set({ expiresAt })
          .where(inArray(permissionGrants.id, retime));
      }
      if (insert.length > 0) {
        const inserted = await tx
          .insert(permissionGrants)
          .values(
            insert.map((row) => ({
              userId: nazirId,
              ...row,
              grantedBy: actorId,
              authorityScopeType: wanted.authority,
              expiresAt,
            }))
          )
          .returning({
            id: permissionGrants.id,
            permission: permissionGrants.permission,
            groupId: permissionGrants.groupId,
            scopeType: permissionGrants.scopeType,
            scopeId: permissionGrants.scopeId,
          });
        await tx.insert(auditLog).values({
          actorId,
          action: "permission.grant",
          entity: "user",
          entityId: nazirId,
          details: {
            madrasahId,
            // The rows themselves, so the başnazım's list of what a Medaris
            // nazımı handed on and this record name the same grants, and the
            // level the giver acted at (a Medaris nazımı acts as the platform).
            authority: wanted.authority,
            grants: inserted.map((g) => ({
              id: g.id,
              permission: g.permission,
              groupId: g.groupId,
              scopeType: g.scopeType,
              scopeId: g.scopeId,
            })),
            permissions: insert.flatMap((i) =>
              i.permission ? [{ code: i.permission, scopeId: i.scopeId }] : []
            ),
            groups: insert.flatMap((i) =>
              i.groupId ? [{ id: i.groupId, scopeId: i.scopeId }] : []
            ),
            expiresAt: expiresAt?.toISOString() ?? null,
          },
        });
      }
      const gone = held.filter((row) => revoke.includes(row.id));
      if (gone.length > 0) {
        await tx.insert(auditLog).values({
          actorId,
          action: "permission.revoke",
          entity: "user",
          entityId: nazirId,
          details: {
            madrasahId,
            authority: wanted.authority,
            grantIds: gone.map((r) => r.id),
            permissions: gone.flatMap((r) =>
              r.permission ? [{ code: r.permission, scopeId: r.scopeId }] : []
            ),
            groupIds: gone.flatMap((r) => (r.groupId ? [r.groupId] : [])),
          },
        });
      }
    });
  }

  /**
   * Everything the nazır handed on in the medrese that is still held (nazir/15's
   * question): roles and permission grants in the medrese or in one of its
   * courses, given to someone else.
   */
  async heldGivenBy(
    madrasahId: string,
    nazirId: string,
    db: Tx | DatabaseService["db"] = this.db
  ): Promise<IGivenRow[]> {
    const inMedrese = inMedreseTree(db, madrasahId);

    const roles = await db
      .select({
        id: roleAssignments.id,
        userId: roleAssignments.userId,
        role: roleAssignments.role,
        scopeType: roleAssignments.scopeType,
        scopeId: roleAssignments.scopeId,
        createdAt: roleAssignments.createdAt,
        expiresAt: roleAssignments.expiresAt,
      })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.grantedBy, nazirId),
          ne(roleAssignments.userId, nazirId),
          isHeld(),
          inMedrese(roleAssignments.scopeType, roleAssignments.scopeId)
        )
      )
      .orderBy(asc(roleAssignments.createdAt), asc(roleAssignments.id));
    const grants = await db
      .select({
        id: permissionGrants.id,
        userId: permissionGrants.userId,
        permission: permissionGrants.permission,
        groupId: permissionGrants.groupId,
        scopeType: permissionGrants.scopeType,
        scopeId: permissionGrants.scopeId,
        createdAt: permissionGrants.createdAt,
        expiresAt: permissionGrants.expiresAt,
      })
      .from(permissionGrants)
      .where(
        and(
          eq(permissionGrants.grantedBy, nazirId),
          ne(permissionGrants.userId, nazirId),
          grantHeld(),
          inMedrese(permissionGrants.scopeType, permissionGrants.scopeId)
        )
      )
      .orderBy(asc(permissionGrants.createdAt), asc(permissionGrants.id));
    return [
      ...roles.map((r) => ({
        ...r,
        kind: "ROLE" as const,
        permission: null,
        groupId: null,
      })),
      ...grants.map((g) => ({
        ...g,
        kind: "GRANT" as const,
        role: null,
      })),
    ];
  }

  /**
   * Görevden al (nazir/15), in one transaction with its audit row: what the
   * nazır handed on is decided first, one answer per person — the caller
   * takes it over (becomes its giver) or it is revoked — then the nazır's own
   * appointment and permissions in the medrese are revoked. Anything short of
   * a decision for exactly the people the nazır gave something to writes
   * nothing.
   */
  async dismiss(
    madrasahId: string,
    nazirId: string,
    actorId: string,
    decisions: ReadonlyArray<{ userId: string; action: DismissAction }>
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [madrasah] = await tx
        .select({ id: madrasahs.id })
        .from(madrasahs)
        .where(eq(madrasahs.id, madrasahId))
        .for("no key update");
      if (!madrasah) throw new MadrasahNotFoundError(madrasahId);
      const [role] = await tx
        .select({ id: roleAssignments.id })
        .from(roleAssignments)
        .where(
          and(
            eq(roleAssignments.userId, nazirId),
            holdsIn(NAZIR_ROLE, madrasahId)
          )
        )
        .for("update")
        .limit(1);
      if (!role) throw new NazirNotFoundError(madrasahId, nazirId);

      const given = await this.heldGivenBy(madrasahId, nazirId, tx);
      const plan = planDismissal(given, decisions);
      if (!plan) throw new DismissDecisionsError();

      const revoked = { revokedAt: sql`now()`, revokedBy: actorId };
      const write = async (
        items: IGivenItem[],
        set: { grantedBy: string } | typeof revoked
      ) => {
        const idsOf = (kind: IGivenItem["kind"]) =>
          items.filter((i) => i.kind === kind).map((i) => i.id);
        if (idsOf("ROLE").length > 0) {
          await tx
            .update(roleAssignments)
            .set(set)
            .where(inArray(roleAssignments.id, idsOf("ROLE")));
        }
        if (idsOf("GRANT").length > 0) {
          await tx
            .update(permissionGrants)
            .set(set)
            .where(inArray(permissionGrants.id, idsOf("GRANT")));
        }
      };
      await write(plan.takeOver, { grantedBy: actorId });
      await write(plan.drop, revoked);

      await tx
        .update(permissionGrants)
        .set(revoked)
        .where(
          and(
            eq(permissionGrants.userId, nazirId),
            inMedreseTree(tx, madrasahId)(
              permissionGrants.scopeType,
              permissionGrants.scopeId
            ),
            isNull(permissionGrants.revokedAt)
          )
        );
      await tx
        .update(roleAssignments)
        .set(revoked)
        .where(eq(roleAssignments.id, role.id));
      await tx.insert(auditLog).values({
        actorId,
        action: "madrasah_nazir.dismiss",
        entity: "madrasah",
        entityId: madrasahId,
        details: {
          userId: nazirId,
          tookOver: plan.takeOver.length,
          dropped: plan.drop.length,
        },
      });
    });
  }
}
