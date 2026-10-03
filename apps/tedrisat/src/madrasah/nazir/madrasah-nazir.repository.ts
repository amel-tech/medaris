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
import { DismissDecisionsError } from "../../assignment/admin/errors";
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

/** Reads and writes behind nazir/05 and nazir/15: the medrese's MEDRESE_NAZIR roles and what hangs on them. */
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

  /** The permissions and groups these people hold in the medrese itself, oldest first. */
  async heldGrants(
    madrasahId: string,
    userIds: string[]
  ): Promise<INazirGrant[]> {
    if (userIds.length === 0) return [];
    return this.db
      .select({
        userId: permissionGrants.userId,
        permission: permissionGrants.permission,
        groupId: permissionGrants.groupId,
        grantedBy: permissionGrants.grantedBy,
        createdAt: permissionGrants.createdAt,
        expiresAt: permissionGrants.expiresAt,
      })
      .from(permissionGrants)
      .where(
        and(
          inArray(permissionGrants.userId, userIds),
          eq(permissionGrants.scopeType, SCOPE_TYPES.MADRASAH),
          eq(permissionGrants.scopeId, madrasahId),
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
    actorId: string
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
        await tx.insert(auditLog).values({
          actorId,
          action: "madrasah_nazir.appoint",
          entity: "madrasah",
          entityId: madrasahId,
          details: { userId },
        });
      }
      return true;
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
    const medreseCourses = db
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.madrasahId, madrasahId));
    const inMedrese = (type: AnyPgColumn, id: AnyPgColumn): SQL =>
      or(
        and(eq(type, SCOPE_TYPES.MADRASAH), eq(id, madrasahId)),
        and(eq(type, SCOPE_TYPES.COURSE), inArray(id, medreseCourses))
      ) as SQL;

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
            eq(permissionGrants.scopeType, SCOPE_TYPES.MADRASAH),
            eq(permissionGrants.scopeId, madrasahId),
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
