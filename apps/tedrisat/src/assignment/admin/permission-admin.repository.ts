import { Injectable } from "@nestjs/common";
import {
  and,
  asc,
  countDistinct,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import type { Tx } from "../../course/course-purge";
import { DatabaseService } from "../../database/database.service";
import { isHeld } from "../../database/role-assignments";
import { auditLog } from "../../database/schema/audit.schema";
import { courses } from "../../database/schema/course.schema";
import {
  permissionGrants,
  permissionGroupItems,
  permissionGroups,
} from "../../database/schema/permission.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
  SCOPE_TYPES,
  type ScopeType,
} from "../../database/schema/role-assignment.schema";
import { users } from "../../database/schema/user.schema";
import { grantHeld } from "../assignment.repository";
import type {
  DismissAction,
  GivenKind,
  UsersPolicy,
} from "./dto/permission-admin.dto";
import {
  DismissDecisionsError,
  GrantExpiryInvalidError,
  MedarisNazimAlreadyAppointedError,
  MedarisNazimNotFoundError,
  PermissionGroupNameTakenError,
  PermissionGroupNotFoundError,
} from "./errors";
import { checkGrantExpiry, type IHeldGrant, planGrants } from "./grant-plan";

/** The platform grants a Medaris nazımı holds, and the course-wide ones. */
const nazimScope = or(
  eq(permissionGrants.scopeType, SCOPE_TYPES.PLATFORM),
  and(
    eq(permissionGrants.scopeType, SCOPE_TYPES.COURSE),
    isNull(permissionGrants.scopeId)
  )
);

const platformScope = eq(permissionGrants.scopeType, SCOPE_TYPES.PLATFORM);

export interface INazimRole {
  id: string;
  userId: string;
  grantedBy: string;
  createdAt: Date;
  expiresAt: Date | null;
}

export interface INazimGrantRow {
  id: string;
  userId: string;
  scopeType: ScopeType;
  permission: string | null;
  groupId: string | null;
  grantedAt: Date;
  expiresAt: Date | null;
}

export interface IGroupRow {
  id: string;
  name: string;
  scopeType: ScopeType;
  scopeId: string | null;
  courseTitle: string | null;
  permissions: string[];
}

export interface IPersonRow {
  id: string;
  givenName: string | null;
  familyName: string | null;
  email: string | null;
}

export interface IGivenRow {
  kind: GivenKind;
  id: string;
  userId: string;
  role: string | null;
  permission: string | null;
  groupId: string | null;
  scopeType: ScopeType;
  scopeId: string | null;
}

export interface IGroupUserRow {
  userId: string;
  expiresAt: Date | null;
}

/** Writes and reads behind the Medaris nazımları and İzin grupları screens (MDRS-171). */
@Injectable()
export class PermissionAdminRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  // ---- reads -------------------------------------------------------------

  /** The Medaris nazımı appointments held now, oldest first. */
  async heldNazimRoles(userId?: string): Promise<INazimRole[]> {
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
          eq(roleAssignments.role, ASSIGNED_ROLES.MEDARIS_NAZIM),
          isHeld(),
          userId ? eq(roleAssignments.userId, userId) : undefined
        )
      )
      .orderBy(asc(roleAssignments.createdAt), asc(roleAssignments.id));
  }

  async heldNazimGrants(userIds: string[]): Promise<INazimGrantRow[]> {
    if (userIds.length === 0) return [];
    return this.db
      .select({
        id: permissionGrants.id,
        userId: permissionGrants.userId,
        scopeType: permissionGrants.scopeType,
        permission: permissionGrants.permission,
        groupId: permissionGrants.groupId,
        grantedAt: permissionGrants.createdAt,
        expiresAt: permissionGrants.expiresAt,
      })
      .from(permissionGrants)
      .where(
        and(inArray(permissionGrants.userId, userIds), nazimScope, grantHeld())
      )
      .orderBy(asc(permissionGrants.createdAt), asc(permissionGrants.id));
  }

  async groupsById(ids: string[]): Promise<Map<string, IGroupRow>> {
    const result = new Map<string, IGroupRow>();
    if (ids.length === 0) return result;
    const rows = await this.db
      .select({
        id: permissionGroups.id,
        name: permissionGroups.name,
        scopeType: permissionGroups.scopeType,
        scopeId: permissionGroups.scopeId,
        courseTitle: courses.title,
      })
      .from(permissionGroups)
      .leftJoin(courses, eq(courses.id, permissionGroups.scopeId))
      .where(
        and(
          inArray(permissionGroups.id, ids),
          isNull(permissionGroups.deletedAt)
        )
      );
    for (const row of rows) result.set(row.id, { ...row, permissions: [] });
    if (result.size === 0) return result;
    const items = await this.db
      .select()
      .from(permissionGroupItems)
      .where(inArray(permissionGroupItems.groupId, [...result.keys()]))
      .orderBy(asc(permissionGroupItems.permission));
    for (const item of items) {
      result.get(item.groupId)?.permissions.push(item.permission);
    }
    return result;
  }

  async people(ids: string[]): Promise<Map<string, IPersonRow>> {
    const result = new Map<string, IPersonRow>();
    const wanted = [...new Set(ids)];
    if (wanted.length === 0) return result;
    const rows = await this.db
      .select({
        id: users.id,
        givenName: users.givenName,
        familyName: users.familyName,
        email: users.email,
      })
      .from(users)
      .where(inArray(users.id, wanted));
    for (const row of rows) result.set(row.id, row);
    return result;
  }

  async courseTitle(courseId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ title: courses.title })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);
    return row?.title ?? null;
  }

  /** Everything the person handed on that is still held (nizam/11's dismissal question). */
  async heldGivenBy(userId: string, db: Tx | DatabaseService["db"] = this.db) {
    const roles = await db
      .select({
        id: roleAssignments.id,
        userId: roleAssignments.userId,
        role: roleAssignments.role,
        scopeType: roleAssignments.scopeType,
        scopeId: roleAssignments.scopeId,
      })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.grantedBy, userId),
          ne(roleAssignments.userId, userId),
          isHeld()
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
      })
      .from(permissionGrants)
      .where(
        and(
          eq(permissionGrants.grantedBy, userId),
          ne(permissionGrants.userId, userId),
          grantHeld()
        )
      )
      .orderBy(asc(permissionGrants.createdAt), asc(permissionGrants.id));
    const rows: IGivenRow[] = [
      ...roles.map((r) => ({
        kind: "ROLE" as const,
        id: r.id,
        userId: r.userId,
        role: r.role as string,
        permission: null,
        groupId: null,
        scopeType: r.scopeType,
        scopeId: r.scopeId,
      })),
      ...grants.map((g) => ({
        kind: "GRANT" as const,
        id: g.id,
        userId: g.userId,
        role: null,
        permission: g.permission,
        groupId: g.groupId,
        scopeType: g.scopeType,
        scopeId: g.scopeId,
      })),
    ];
    return rows;
  }

  // ---- Medaris nazımı writes --------------------------------------------

  /**
   * Appoints the person and gives them their permissions, in one transaction
   * with the audit rows. The appointment ends when the permissions do.
   */
  async appoint(
    actorId: string,
    input: {
      userId: string;
      expiresAt: Date | null;
      groupId: string | null;
      permissions: string[];
    }
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const seat = and(
        eq(roleAssignments.userId, input.userId),
        eq(roleAssignments.role, ASSIGNED_ROLES.MEDARIS_NAZIM),
        isNull(roleAssignments.scopeId),
        isNull(roleAssignments.revokedAt)
      );
      // A seat that lapsed but was never revoked would hold the unique index.
      await tx
        .update(roleAssignments)
        .set({ revokedAt: sql`now()`, revokedBy: actorId })
        .where(and(seat, lte(roleAssignments.expiresAt, sql`now()`)));
      const inserted = await tx
        .insert(roleAssignments)
        .values({
          userId: input.userId,
          role: ASSIGNED_ROLES.MEDARIS_NAZIM,
          scopeType: SCOPE_TYPES.PLATFORM,
          scopeId: null,
          grantedBy: actorId,
          expiresAt: input.expiresAt,
        })
        .onConflictDoNothing()
        .returning({ id: roleAssignments.id });
      if (inserted.length === 0) {
        throw new MedarisNazimAlreadyAppointedError(input.userId);
      }
      await tx.insert(auditLog).values({
        actorId,
        action: "medaris_nazim.appoint",
        entity: "user",
        entityId: input.userId,
        details: { expiresAt: input.expiresAt?.toISOString() ?? null },
      });
      await this.applyGrants(tx, actorId, input.userId, {
        groupId: input.groupId,
        permissions: input.permissions,
        expiresAt: input.expiresAt,
      });
    });
  }

  /**
   * Replaces the person's platform permissions with the ones wanted (nizam/12's
   * Kaydet): rows that stay are left alone, the rest are revoked in the actor's
   * name or added. `expiresAt` null means "when the appointment ends".
   */
  async setGrants(
    actorId: string,
    userId: string,
    wanted: {
      groupId: string | null;
      permissions: string[];
      expiresAt: Date | null;
    }
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const role = await this.lockNazimRole(tx, userId);
      const expiresAt = wanted.expiresAt ?? role.expiresAt;
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
      await this.applyGrants(tx, actorId, userId, { ...wanted, expiresAt });
    });
  }

  /** Diffs the held platform grants against the wanted ones and writes the audit rows. */
  private async applyGrants(
    tx: Tx,
    actorId: string,
    userId: string,
    wanted: {
      groupId: string | null;
      permissions: string[];
      expiresAt: Date | null;
    }
  ): Promise<void> {
    const held = await tx
      .select({
        id: permissionGrants.id,
        permission: permissionGrants.permission,
        groupId: permissionGrants.groupId,
        expiresAt: permissionGrants.expiresAt,
      })
      .from(permissionGrants)
      .where(
        and(eq(permissionGrants.userId, userId), platformScope, grantHeld())
      )
      .orderBy(asc(permissionGrants.createdAt), asc(permissionGrants.id));
    const plan = planGrants(held as IHeldGrant[], wanted);

    if (plan.revoke.length > 0) {
      await tx
        .update(permissionGrants)
        .set({ revokedAt: sql`now()`, revokedBy: actorId })
        .where(inArray(permissionGrants.id, plan.revoke));
    }
    if (plan.retime.length > 0) {
      await tx
        .update(permissionGrants)
        .set({ expiresAt: wanted.expiresAt })
        .where(inArray(permissionGrants.id, plan.retime));
    }
    if (plan.insert.length > 0) {
      await tx.insert(permissionGrants).values(
        plan.insert.map((item) => ({
          userId,
          scopeType: SCOPE_TYPES.PLATFORM,
          scopeId: null,
          permission: "permission" in item ? item.permission : null,
          groupId: "groupId" in item ? item.groupId : null,
          grantedBy: actorId,
          expiresAt: wanted.expiresAt,
        }))
      );
    }

    const revoked = held.filter((row) => plan.revoke.includes(row.id));
    if (plan.insert.length > 0) {
      await tx.insert(auditLog).values({
        actorId,
        action: "permission.grant",
        entity: "user",
        entityId: userId,
        details: {
          permissions: plan.insert.flatMap((i) =>
            "permission" in i ? [i.permission] : []
          ),
          groupId:
            plan.insert.flatMap((i) =>
              "groupId" in i ? [i.groupId] : []
            )[0] ?? null,
          expiresAt: wanted.expiresAt?.toISOString() ?? null,
        },
      });
    }
    if (revoked.length > 0) {
      await tx.insert(auditLog).values({
        actorId,
        action: "permission.revoke",
        entity: "user",
        entityId: userId,
        details: {
          permissions: revoked.flatMap((r) =>
            r.permission ? [r.permission] : []
          ),
          groupIds: revoked.flatMap((r) => (r.groupId ? [r.groupId] : [])),
        },
      });
    }
  }

  private async lockNazimRole(tx: Tx, userId: string): Promise<INazimRole> {
    const [role] = await tx
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
          eq(roleAssignments.userId, userId),
          eq(roleAssignments.role, ASSIGNED_ROLES.MEDARIS_NAZIM),
          isHeld()
        )
      )
      .for("update")
      .limit(1);
    if (!role) throw new MedarisNazimNotFoundError(userId);
    return role;
  }

  /**
   * Takes the appointment and every platform permission away (nizam/11's
   * Görevden al). What the person handed on is decided first, one answer per
   * item: the başnazım takes it over, or it is revoked.
   */
  async dismiss(
    actorId: string,
    userId: string,
    decisions: Array<{ kind: GivenKind; id: string; action: DismissAction }>
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const role = await this.lockNazimRole(tx, userId);
      const given = await this.heldGivenBy(userId, tx);
      const key = (kind: string, id: string) => `${kind}:${id}`;
      const decided = new Map(decisions.map((d) => [key(d.kind, d.id), d]));
      const complete =
        decided.size === decisions.length &&
        decided.size === given.length &&
        given.every((g) => decided.has(key(g.kind, g.id)));
      if (!complete) throw new DismissDecisionsError();

      for (const item of given) {
        const action = decided.get(key(item.kind, item.id))?.action;
        const take = action === "TAKE_OVER";
        if (item.kind === "ROLE") {
          await tx
            .update(roleAssignments)
            .set(
              take
                ? { grantedBy: actorId }
                : { revokedAt: sql`now()`, revokedBy: actorId }
            )
            .where(eq(roleAssignments.id, item.id));
        } else {
          await tx
            .update(permissionGrants)
            .set(
              take
                ? { grantedBy: actorId }
                : { revokedAt: sql`now()`, revokedBy: actorId }
            )
            .where(eq(permissionGrants.id, item.id));
        }
      }

      await tx
        .update(permissionGrants)
        .set({ revokedAt: sql`now()`, revokedBy: actorId })
        .where(
          and(
            eq(permissionGrants.userId, userId),
            nazimScope,
            isNull(permissionGrants.revokedAt)
          )
        );
      await tx
        .update(roleAssignments)
        .set({ revokedAt: sql`now()`, revokedBy: actorId })
        .where(eq(roleAssignments.id, role.id));
      await tx.insert(auditLog).values({
        actorId,
        action: "medaris_nazim.dismiss",
        entity: "user",
        entityId: userId,
        details: {
          tookOver: given.filter(
            (g) => decided.get(key(g.kind, g.id))?.action === "TAKE_OVER"
          ).length,
          dropped: given.filter(
            (g) => decided.get(key(g.kind, g.id))?.action === "DROP"
          ).length,
        },
      });
    });
  }

  // ---- groups ------------------------------------------------------------

  /** The platform's and the course groups that are not deleted, with their user counts. */
  async listGroups(): Promise<Array<IGroupRow & { userCount: number }>> {
    const rows = await this.db
      .select({
        id: permissionGroups.id,
        scopeType: permissionGroups.scopeType,
      })
      .from(permissionGroups)
      .where(
        and(
          isNull(permissionGroups.deletedAt),
          inArray(permissionGroups.scopeType, [
            SCOPE_TYPES.PLATFORM,
            SCOPE_TYPES.COURSE,
          ])
        )
      );
    const groups = await this.groupsById(rows.map((r) => r.id));
    const counts = await this.userCounts([...groups.keys()]);
    return [...groups.values()]
      .map((g) => ({ ...g, userCount: counts.get(g.id) ?? 0 }))
      .sort(
        (a, b) =>
          (a.scopeType === SCOPE_TYPES.PLATFORM ? 0 : 1) -
            (b.scopeType === SCOPE_TYPES.PLATFORM ? 0 : 1) ||
          a.name.localeCompare(b.name, "tr")
      );
  }

  async userCounts(groupIds: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (groupIds.length === 0) return result;
    const rows = await this.db
      .select({
        groupId: permissionGrants.groupId,
        n: countDistinct(permissionGrants.userId),
      })
      .from(permissionGrants)
      .where(and(inArray(permissionGrants.groupId, groupIds), grantHeld()))
      .groupBy(permissionGrants.groupId);
    for (const row of rows) if (row.groupId) result.set(row.groupId, row.n);
    return result;
  }

  async findGroup(
    id: string
  ): Promise<(IGroupRow & { userCount: number }) | null> {
    const groups = await this.groupsById([id]);
    const group = groups.get(id);
    if (!group) return null;
    const counts = await this.userCounts([id]);
    return { ...group, userCount: counts.get(id) ?? 0 };
  }

  async groupUsers(groupId: string): Promise<IGroupUserRow[]> {
    const rows = await this.db
      .select({
        userId: permissionGrants.userId,
        expiresAt: permissionGrants.expiresAt,
      })
      .from(permissionGrants)
      .where(and(eq(permissionGrants.groupId, groupId), grantHeld()))
      .orderBy(asc(permissionGrants.createdAt), asc(permissionGrants.id));
    const seen = new Set<string>();
    return rows.filter((r) => !seen.has(r.userId) && seen.add(r.userId));
  }

  async nazimUserIds(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await this.db
      .select({ userId: roleAssignments.userId })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.role, ASSIGNED_ROLES.MEDARIS_NAZIM),
          inArray(roleAssignments.userId, userIds),
          isHeld()
        )
      );
    return new Set(rows.map((r) => r.userId));
  }

  /** Whether a live group already has the name (case-insensitively) where the new one would clash. */
  async nameTaken(
    name: string,
    scopeId: string | null,
    exceptId?: string
  ): Promise<boolean> {
    const rows = await this.db
      .select({ id: permissionGroups.id })
      .from(permissionGroups)
      .where(
        and(
          isNull(permissionGroups.deletedAt),
          sql`lower(${permissionGroups.name}) = lower(${name})`,
          scopeId === null
            ? isNull(permissionGroups.scopeId)
            : eq(permissionGroups.scopeId, scopeId),
          exceptId ? ne(permissionGroups.id, exceptId) : undefined
        )
      )
      .limit(1);
    return rows.length > 0;
  }

  async createGroup(
    actorId: string,
    input: {
      name: string;
      scopeType: ScopeType;
      scopeId: string | null;
      permissions: string[];
    }
  ): Promise<string> {
    try {
      return await this.db.transaction(async (tx) => {
        const [group] = await tx
          .insert(permissionGroups)
          .values({
            name: input.name,
            scopeType: input.scopeType,
            scopeId: input.scopeId,
            createdBy: actorId,
          })
          .returning({ id: permissionGroups.id });
        await tx.insert(permissionGroupItems).values(
          input.permissions.map((permission) => ({
            groupId: group.id,
            permission,
          }))
        );
        await tx.insert(auditLog).values({
          actorId,
          action: "permission_group.create",
          entity: "permission_group",
          entityId: group.id,
          details: {
            name: input.name,
            scopeType: input.scopeType,
            scopeId: input.scopeId,
            permissions: input.permissions,
          },
        });
        return group.id;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new PermissionGroupNameTakenError(input.name);
      }
      throw error;
    }
  }

  /**
   * Renames the group and sets its permissions. When the permissions change
   * while people hold the group, `usersPolicy` says what they keep: the
   * group's old permissions as single permissions, or nothing. Either way
   * they no longer hold the group row, so the new set reaches only whoever is
   * given the group from now on.
   */
  async updateGroup(
    actorId: string,
    id: string,
    input: {
      name: string;
      permissions: string[];
      usersPolicy: UsersPolicy | null;
    }
  ): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        const group = await this.lockGroup(tx, id);
        const old = await tx
          .select({ permission: permissionGroupItems.permission })
          .from(permissionGroupItems)
          .where(eq(permissionGroupItems.groupId, id));
        const oldCodes = old.map((o) => o.permission);
        const changed =
          oldCodes.length !== input.permissions.length ||
          oldCodes.some((c) => !input.permissions.includes(c));

        let affected = 0;
        if (changed && input.usersPolicy) {
          affected = await this.detachUsers(
            tx,
            actorId,
            id,
            oldCodes,
            input.usersPolicy
          );
        }
        if (input.name !== group.name) {
          await tx
            .update(permissionGroups)
            .set({ name: input.name })
            .where(eq(permissionGroups.id, id));
        }
        if (changed) {
          await tx
            .delete(permissionGroupItems)
            .where(eq(permissionGroupItems.groupId, id));
          await tx.insert(permissionGroupItems).values(
            input.permissions.map((permission) => ({
              groupId: id,
              permission,
            }))
          );
        }
        await tx.insert(auditLog).values({
          actorId,
          action: "permission_group.update",
          entity: "permission_group",
          entityId: id,
          details: {
            name: input.name,
            previousName: group.name,
            permissions: input.permissions,
            previousPermissions: oldCodes,
            usersPolicy: changed ? input.usersPolicy : null,
            affectedUsers: affected,
          },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new PermissionGroupNameTakenError(input.name);
      }
      throw error;
    }
  }

  async deleteGroup(
    actorId: string,
    id: string,
    usersPolicy: UsersPolicy | null
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const group = await this.lockGroup(tx, id);
      const old = await tx
        .select({ permission: permissionGroupItems.permission })
        .from(permissionGroupItems)
        .where(eq(permissionGroupItems.groupId, id));
      const affected = usersPolicy
        ? await this.detachUsers(
            tx,
            actorId,
            id,
            old.map((o) => o.permission),
            usersPolicy
          )
        : 0;
      await tx
        .update(permissionGroups)
        .set({ deletedAt: sql`now()` })
        .where(eq(permissionGroups.id, id));
      await tx.insert(auditLog).values({
        actorId,
        action: "permission_group.delete",
        entity: "permission_group",
        entityId: id,
        details: {
          name: group.name,
          permissions: old.map((o) => o.permission),
          usersPolicy,
          affectedUsers: affected,
        },
      });
    });
  }

  private async lockGroup(
    tx: Tx,
    id: string
  ): Promise<{ id: string; name: string }> {
    const [group] = await tx
      .select({ id: permissionGroups.id, name: permissionGroups.name })
      .from(permissionGroups)
      .where(
        and(eq(permissionGroups.id, id), isNull(permissionGroups.deletedAt))
      )
      .for("update")
      .limit(1);
    if (!group) throw new PermissionGroupNotFoundError(id);
    return group;
  }

  /**
   * Ends everyone's hold of the group row, in the actor's name. `keep` first
   * gives each person the group's permissions as single ones (same scope, same
   * end, same giver), skipping what they hold singly already. Returns how many
   * people were concerned.
   */
  private async detachUsers(
    tx: Tx,
    actorId: string,
    groupId: string,
    codes: string[],
    policy: UsersPolicy
  ): Promise<number> {
    const rows = await tx
      .select()
      .from(permissionGrants)
      .where(and(eq(permissionGrants.groupId, groupId), grantHeld()));
    for (const row of rows) {
      if (policy === "keep") {
        const have = await tx
          .select({ permission: permissionGrants.permission })
          .from(permissionGrants)
          .where(
            and(
              eq(permissionGrants.userId, row.userId),
              eq(permissionGrants.scopeType, row.scopeType),
              row.scopeId === null
                ? isNull(permissionGrants.scopeId)
                : eq(permissionGrants.scopeId, row.scopeId),
              isNotNull(permissionGrants.permission),
              grantHeld()
            )
          );
        const held = new Set(have.map((h) => h.permission));
        const missing = codes.filter((c) => !held.has(c));
        if (missing.length > 0) {
          await tx.insert(permissionGrants).values(
            missing.map((permission) => ({
              userId: row.userId,
              scopeType: row.scopeType,
              scopeId: row.scopeId,
              permission,
              groupId: null,
              grantedBy: row.grantedBy,
              expiresAt: row.expiresAt,
            }))
          );
        }
      }
      await tx
        .update(permissionGrants)
        .set({ revokedAt: sql`now()`, revokedBy: actorId })
        .where(eq(permissionGrants.id, row.id));
    }
    return new Set(rows.map((r) => r.userId)).size;
  }
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 4; depth++) {
    if (
      typeof current === "object" &&
      "code" in current &&
      (current as { code: unknown }).code === "23505"
    ) {
      return true;
    }
    current =
      typeof current === "object" && "cause" in current
        ? (current as { cause: unknown }).cause
        : undefined;
  }
  return false;
}
