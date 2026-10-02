import { Injectable } from "@nestjs/common";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { grantHeld } from "../assignment/assignment.repository";
import { DatabaseService } from "../database/database.service";
import { grantRole, isHeld } from "../database/role-assignments";
import { auditLog } from "../database/schema/audit.schema";
import { courseMuderris, courses } from "../database/schema/course.schema";
import { kosks } from "../database/schema/kosk.schema";
import { madrasahs } from "../database/schema/madrasah.schema";
import {
  permissionGrants,
  permissionGroupItems,
} from "../database/schema/permission.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
  SCOPE_TYPES,
} from "../database/schema/role-assignment.schema";
import { users } from "../database/schema/user.schema";
import { type InactiveScopeType, MANAGER_OF } from "./inactive-scope.rules";

export interface ILastPost {
  scopeId: string;
  userId: string;
  role: string;
  isImam: boolean;
  revokedAt: Date | null;
  expiresAt: Date | null;
  revokedBy: string | null;
}

export interface IScopeInfo {
  id: string;
  name: string;
  kosk: { id: string; name: string } | null;
}

export interface IPersonRow {
  id: string;
  givenName: string | null;
  familyName: string | null;
  email: string | null;
}

const asDate = (value: Date | string | null): Date | null =>
  value === null ? null : new Date(value);

/** Reads and writes behind the Pasif kapsamlar page (MDRS-172, nizam/14). */
@Injectable()
export class InactiveScopeRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /**
   * For each scope of the type that once had a manager and has none now, the
   * post that ended last. A scope that never had one (a fresh draft) is not
   * passive, it is new.
   */
  async lastPosts(type: InactiveScopeType): Promise<ILastPost[]> {
    const { role, scopeType } = MANAGER_OF[type];
    const result = await this.db.execute<{
      scope_id: string;
      user_id: string;
      role: string;
      is_imam: boolean;
      revoked_at: Date | string | null;
      expires_at: Date | string | null;
      revoked_by: string | null;
    }>(sql`
      select distinct on (ra.scope_id)
             ra.scope_id, ra.user_id, ra.role, ra.is_imam,
             ra.revoked_at, ra.expires_at, ra.revoked_by
        from role_assignments ra
       where ra.role = ${role} and ra.scope_type = ${scopeType}
         and not exists (
           select 1 from role_assignments h
            where h.role = ${role} and h.scope_id = ra.scope_id
              and h.revoked_at is null
              and (h.expires_at is null or h.expires_at > now()))
       order by ra.scope_id,
                least(ra.revoked_at, ra.expires_at) desc nulls last,
                ra.created_at desc`);
    return result.rows.map((r) => ({
      scopeId: r.scope_id,
      userId: r.user_id,
      role: r.role,
      isImam: r.is_imam,
      // A raw `execute` skips drizzle's column mappers: timestamps arrive as text.
      revokedAt: asDate(r.revoked_at),
      expiresAt: asDate(r.expires_at),
      revokedBy: r.revoked_by,
    }));
  }

  /** Name and köşk of the scopes that are not hidden; a hidden or missing one has no entry. */
  async scopeInfo(
    type: InactiveScopeType,
    ids: string[]
  ): Promise<Map<string, IScopeInfo>> {
    const result = new Map<string, IScopeInfo>();
    if (ids.length === 0) return result;
    if (type === "KOSK") {
      const rows = await this.db
        .select({ id: kosks.id, name: kosks.name })
        .from(kosks)
        .where(and(inArray(kosks.id, ids), isNull(kosks.archivedAt)));
      for (const r of rows) result.set(r.id, { ...r, kosk: null });
    } else if (type === "MADRASAH") {
      const rows = await this.db
        .select({ id: madrasahs.id, name: madrasahs.name })
        .from(madrasahs)
        .where(and(inArray(madrasahs.id, ids), isNull(madrasahs.archivedAt)));
      for (const r of rows) result.set(r.id, { ...r, kosk: null });
    } else {
      const rows = await this.db
        .select({
          id: courses.id,
          name: courses.title,
          koskId: kosks.id,
          koskName: kosks.name,
        })
        .from(courses)
        .innerJoin(kosks, eq(kosks.id, courses.koskId))
        .where(
          and(
            inArray(courses.id, ids),
            isNull(courses.archivedAt),
            isNull(kosks.archivedAt)
          )
        );
      for (const r of rows) {
        result.set(r.id, {
          id: r.id,
          name: r.name,
          kosk: { id: r.koskId, name: r.koskName },
        });
      }
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

  /**
   * What each person among `userIds` has been: a Medaris nazımı at any time,
   * or a nazım of the köşk the scope belongs to (a held or a past row).
   */
  async everRoles(
    userIds: string[]
  ): Promise<{ medaris: Set<string>; koskNazim: Map<string, Set<string>> }> {
    const medaris = new Set<string>();
    const koskNazim = new Map<string, Set<string>>();
    if (userIds.length === 0) return { medaris, koskNazim };
    const rows = await this.db
      .select({
        userId: roleAssignments.userId,
        role: roleAssignments.role,
        scopeId: roleAssignments.scopeId,
      })
      .from(roleAssignments)
      .where(
        and(
          inArray(roleAssignments.userId, userIds),
          inArray(roleAssignments.role, [
            ASSIGNED_ROLES.MEDARIS_NAZIM,
            ASSIGNED_ROLES.KOSK_NAZIM,
          ])
        )
      );
    for (const r of rows) {
      if (r.role === ASSIGNED_ROLES.MEDARIS_NAZIM) medaris.add(r.userId);
      else if (r.scopeId) {
        const set = koskNazim.get(r.userId) ?? new Set<string>();
        set.add(r.scopeId);
        koskNazim.set(r.userId, set);
      }
    }
    return { medaris, koskNazim };
  }

  /**
   * Whether the user is a Medaris nazımı holding the platform permission, by
   * a single grant or through a group they hold.
   */
  async holdsPlatformPermission(
    userId: string,
    code: string
  ): Promise<boolean> {
    const role = await this.db
      .select({ id: roleAssignments.id })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.userId, userId),
          eq(roleAssignments.role, ASSIGNED_ROLES.MEDARIS_NAZIM),
          isHeld()
        )
      )
      .limit(1);
    if (role.length === 0) return false;
    const grants = await this.db
      .select({
        permission: permissionGrants.permission,
        groupId: permissionGrants.groupId,
      })
      .from(permissionGrants)
      .where(
        and(
          eq(permissionGrants.userId, userId),
          eq(permissionGrants.scopeType, SCOPE_TYPES.PLATFORM),
          grantHeld()
        )
      );
    if (grants.some((g) => g.permission === code)) return true;
    const groupIds = grants.flatMap((g) => (g.groupId ? [g.groupId] : []));
    if (groupIds.length === 0) return false;
    const items = await this.db
      .select({ groupId: permissionGroupItems.groupId })
      .from(permissionGroupItems)
      .where(
        and(
          inArray(permissionGroupItems.groupId, groupIds),
          eq(permissionGroupItems.permission, code)
        )
      )
      .limit(1);
    return items.length > 0;
  }

  /** Whether the scope has no manager now (and exists, is not hidden). */
  async isInactive(type: InactiveScopeType, id: string): Promise<boolean> {
    const scopes = await this.scopeInfo(type, [id]);
    if (!scopes.has(id)) return false;
    const { role } = MANAGER_OF[type];
    const held = await this.db
      .select({ id: roleAssignments.id })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.role, role),
          eq(roleAssignments.scopeId, id),
          isHeld()
        )
      )
      .limit(1);
    return held.length === 0;
  }

  /**
   * Gives an inactive scope its manager again (nizam/14's "… ata"), with the
   * audit row, in one transaction: the köşk and the medrese lose their passive
   * mark, a course gets its müderris (the imam, as the course has none) on the
   * course page's list too. The medrese's başmüderris goes through
   * `MadrasahService.setHeadMuderris`, not here.
   */
  async assign(
    actorId: string,
    type: Exclude<InactiveScopeType, "MADRASAH">,
    scopeId: string,
    input: { userId: string; endsAt: Date | null; displayName: string }
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const { role } = MANAGER_OF[type];
      await grantRole(tx, {
        userId: input.userId,
        role,
        scopeId,
        grantedBy: actorId,
        expiresAt: input.endsAt,
        isImam: type === "COURSE",
      });
      if (type === "KOSK") {
        await tx
          .update(kosks)
          .set({
            passiveSince: null,
            passiveReason: null,
            updatedAt: new Date(),
          })
          .where(eq(kosks.id, scopeId));
      } else {
        const [listed] = await tx
          .select({ id: courseMuderris.id })
          .from(courseMuderris)
          .where(
            and(
              eq(courseMuderris.courseId, scopeId),
              eq(courseMuderris.userId, input.userId)
            )
          )
          .limit(1);
        if (!listed) {
          const [{ next }] = await tx
            .select({
              next: sql<number>`coalesce(max(${courseMuderris.orderIndex}) + 1, 0)`,
            })
            .from(courseMuderris)
            .where(eq(courseMuderris.courseId, scopeId));
          await tx.insert(courseMuderris).values({
            courseId: scopeId,
            userId: input.userId,
            name: input.displayName,
            orderIndex: next,
          });
        }
      }
      await tx.insert(auditLog).values({
        actorId,
        action: "inactive_scope.assign",
        entity: type.toLowerCase(),
        entityId: scopeId,
        details: {
          type,
          userId: input.userId,
          endsAt: input.endsAt?.toISOString() ?? null,
        },
      });
    });
  }

  /** "İçeriği gör": every opening is on the record (nizam/14, criterion 4). */
  async recordView(
    actorId: string,
    type: InactiveScopeType,
    scopeId: string
  ): Promise<void> {
    await this.db.insert(auditLog).values({
      actorId,
      action: "inactive_scope.view",
      entity: type.toLowerCase(),
      entityId: scopeId,
      details: { type },
    });
  }
}
