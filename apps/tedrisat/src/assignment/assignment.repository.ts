import { Injectable } from "@nestjs/common";
import { and, count, eq, gt, inArray, isNull, or, SQL, sql } from "drizzle-orm";
import { CourseStatus } from "../course/domain/course-status.enum";
import { EnrollmentStatus } from "../course/domain/enrollment-status.enum";
import { DatabaseService } from "../database/database.service";
import { isHeld } from "../database/role-assignments";
import { auditLog } from "../database/schema/audit.schema";
import { courses, enrollments } from "../database/schema/course.schema";
import { kosks } from "../database/schema/kosk.schema";
import { madrasahs } from "../database/schema/madrasah.schema";
import {
  permissionGrants,
  permissionGroupItems,
  permissionGroups,
} from "../database/schema/permission.schema";
import {
  type AssignedRole,
  roleAssignments,
  SCOPE_TYPES,
  type ScopeType,
} from "../database/schema/role-assignment.schema";
import { users } from "../database/schema/user.schema";

export interface IAssignmentRow {
  id: string;
  role: AssignedRole;
  scopeType: ScopeType;
  scopeId: string | null;
  isImam: boolean;
  grantedAt: Date;
  expiresAt: Date | null;
  grantedBy: string;
}

export interface INamedScope {
  name: string;
  course?: {
    status: CourseStatus;
    hidden: boolean;
    koskId: string;
    koskName: string;
    madrasahId: string | null;
    madrasahName: string | null;
    studentCount: number;
  };
}

export interface IGrantRow {
  id: string;
  scopeType: ScopeType;
  scopeId: string | null;
  permission: string | null;
  groupId: string | null;
  grantedAt: Date;
  expiresAt: Date | null;
  grantedBy: string;
}

export interface IGroupRef {
  id: string;
  name: string;
  permissions: string[];
}

export interface IPersonName {
  givenName: string | null;
  familyName: string | null;
  email: string | null;
}

/** A grant is held while it is neither revoked nor past its end. */
export function grantHeld(): SQL {
  return and(
    isNull(permissionGrants.revokedAt),
    or(
      isNull(permissionGrants.expiresAt),
      gt(permissionGrants.expiresAt, sql`now()`)
    )
  ) as SQL;
}

/**
 * Reads behind `/me/assignments`, `/me/grants` and `/me/effective-permissions`
 * (MDRS-169). Only the caller's own rows are read, so nothing here takes a
 * second user id.
 */
@Injectable()
export class AssignmentRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  async findHeldAssignments(userId: string): Promise<IAssignmentRow[]> {
    return this.db
      .select({
        id: roleAssignments.id,
        role: roleAssignments.role,
        scopeType: roleAssignments.scopeType,
        scopeId: roleAssignments.scopeId,
        isImam: roleAssignments.isImam,
        grantedAt: roleAssignments.createdAt,
        expiresAt: roleAssignments.expiresAt,
        grantedBy: roleAssignments.grantedBy,
      })
      .from(roleAssignments)
      .where(and(eq(roleAssignments.userId, userId), isHeld()))
      .orderBy(roleAssignments.createdAt, roleAssignments.id);
  }

  async findHeldGrants(userId: string): Promise<IGrantRow[]> {
    return this.db
      .select({
        id: permissionGrants.id,
        scopeType: permissionGrants.scopeType,
        scopeId: permissionGrants.scopeId,
        permission: permissionGrants.permission,
        groupId: permissionGrants.groupId,
        grantedAt: permissionGrants.createdAt,
        expiresAt: permissionGrants.expiresAt,
        grantedBy: permissionGrants.grantedBy,
      })
      .from(permissionGrants)
      .where(and(eq(permissionGrants.userId, userId), grantHeld()))
      .orderBy(permissionGrants.createdAt, permissionGrants.id);
  }

  async findGroups(ids: string[]): Promise<Map<string, IGroupRef>> {
    const result = new Map<string, IGroupRef>();
    if (ids.length === 0) return result;
    const groups = await this.db
      .select({ id: permissionGroups.id, name: permissionGroups.name })
      .from(permissionGroups)
      .where(
        and(
          inArray(permissionGroups.id, ids),
          isNull(permissionGroups.deletedAt)
        )
      );
    for (const group of groups) {
      result.set(group.id, { id: group.id, name: group.name, permissions: [] });
    }
    if (result.size === 0) return result;
    const items = await this.db
      .select()
      .from(permissionGroupItems)
      .where(inArray(permissionGroupItems.groupId, [...result.keys()]));
    for (const item of items) {
      result.get(item.groupId)?.permissions.push(item.permission);
    }
    return result;
  }

  /** Names of the scopes the rows point at, one query per kind of scope. */
  async findScopeNames(
    refs: ReadonlyArray<{ type: ScopeType; id: string | null }>
  ): Promise<Map<string, INamedScope>> {
    const idsOf = (type: ScopeType) => [
      ...new Set(
        refs.flatMap((ref) => (ref.type === type && ref.id ? [ref.id] : []))
      ),
    ];
    const result = new Map<string, INamedScope>();

    const koskIds = idsOf(SCOPE_TYPES.KOSK);
    if (koskIds.length > 0) {
      const rows = await this.db
        .select({ id: kosks.id, name: kosks.name })
        .from(kosks)
        .where(inArray(kosks.id, koskIds));
      for (const row of rows) {
        result.set(`${SCOPE_TYPES.KOSK}:${row.id}`, { name: row.name });
      }
    }

    const madrasahIds = idsOf(SCOPE_TYPES.MADRASAH);
    if (madrasahIds.length > 0) {
      const rows = await this.db
        .select({ id: madrasahs.id, name: madrasahs.name })
        .from(madrasahs)
        .where(inArray(madrasahs.id, madrasahIds));
      for (const row of rows) {
        result.set(`${SCOPE_TYPES.MADRASAH}:${row.id}`, { name: row.name });
      }
    }

    const courseIds = idsOf(SCOPE_TYPES.COURSE);
    if (courseIds.length > 0) {
      const rows = await this.db
        .select({
          id: courses.id,
          title: courses.title,
          status: courses.status,
          archivedAt: courses.archivedAt,
          koskId: courses.koskId,
          koskName: kosks.name,
          madrasahId: courses.madrasahId,
          madrasahName: madrasahs.name,
        })
        .from(courses)
        .innerJoin(kosks, eq(kosks.id, courses.koskId))
        .leftJoin(madrasahs, eq(madrasahs.id, courses.madrasahId))
        .where(inArray(courses.id, courseIds));
      const counts = await this.db
        .select({ courseId: enrollments.courseId, n: count() })
        .from(enrollments)
        .where(
          and(
            inArray(enrollments.courseId, courseIds),
            eq(enrollments.status, EnrollmentStatus.ENROLLED)
          )
        )
        .groupBy(enrollments.courseId);
      const studentCounts = new Map(counts.map((c) => [c.courseId, c.n]));
      for (const row of rows) {
        result.set(`${SCOPE_TYPES.COURSE}:${row.id}`, {
          name: row.title,
          course: {
            status: row.status as CourseStatus,
            hidden: row.archivedAt !== null,
            koskId: row.koskId,
            koskName: row.koskName,
            madrasahId: row.madrasahId,
            madrasahName: row.madrasahName,
            studentCount: studentCounts.get(row.id) ?? 0,
          },
        });
      }
    }
    return result;
  }

  async findPeople(ids: string[]): Promise<Map<string, IPersonName>> {
    const result = new Map<string, IPersonName>();
    if (ids.length === 0) return result;
    const rows = await this.db
      .select({
        id: users.id,
        givenName: users.givenName,
        familyName: users.familyName,
        email: users.email,
      })
      .from(users)
      .where(inArray(users.id, [...new Set(ids)]));
    for (const row of rows) result.set(row.id, row);
    return result;
  }

  /** Whether the user holds any role at all (the people who may look others up). */
  async holdsAnyRole(userId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: roleAssignments.id })
      .from(roleAssignments)
      .where(and(eq(roleAssignments.userId, userId), isHeld()))
      .limit(1);
    return rows.length > 0;
  }

  async recordUserLookup(entry: {
    actorId: string;
    foundId: string | null;
    email: string;
  }): Promise<void> {
    await this.db.insert(auditLog).values({
      actorId: entry.actorId,
      action: "user.lookup",
      entity: "user",
      entityId: entry.foundId ?? "00000000-0000-0000-0000-000000000000",
      details: {
        email: entry.email.toLowerCase(),
        found: entry.foundId !== null,
      },
    });
  }
}
