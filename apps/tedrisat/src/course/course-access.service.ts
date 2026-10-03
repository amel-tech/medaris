import { AuthenticatedUser, AuthzForbiddenError } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { grantHeld } from "../assignment/assignment.repository";
import {
  type PermissionCode,
  ROLE_DEFAULT_PERMISSIONS,
} from "../assignment/permission-catalog";
import { DatabaseService } from "../database/database.service";
import {
  permissionGrants,
  permissionGroupItems,
} from "../database/schema/permission.schema";
import {
  ASSIGNED_ROLES,
  SCOPE_TYPES,
} from "../database/schema/role-assignment.schema";
import { KoskService } from "../kosk/kosk.service";
import { grantableCourseCodes } from "../kosk/kosk-grants-rules";
import { isSystemAdmin } from "../platform-access/platform-access.service";
import { CourseRepository } from "./course.repository";
import { CourseNotFoundError } from "./errors/course-not-found.error";

/** The roles that matter here, as the caller holds them in one course. */
export interface ICourseStanding {
  /** nazım of the course's köşk */
  koskNazim: boolean;
  /** müderris of the course */
  muderris: boolean;
}

/**
 * Whether a role held in or above the course carries `code` by default. The
 * müderris's defaults name the course codes outright; the köşk nazımı's carry
 * `course.manage_all`, which covers every course code in the köşk's courses
 * (the same reading `grantableCourseCodes` gives it on the İzinler page).
 * Pure, so the rule is pinned without a database.
 */
export function standingCarries(
  standing: ICourseStanding,
  code: PermissionCode
): boolean {
  if (
    standing.muderris &&
    ROLE_DEFAULT_PERMISSIONS[ASSIGNED_ROLES.MUDERRIS].includes(code)
  ) {
    return true;
  }
  return (
    standing.koskNazim &&
    grantableCourseCodes(
      ROLE_DEFAULT_PERMISSIONS[ASSIGNED_ROLES.KOSK_NAZIM]
    ).includes(code)
  );
}

/**
 * Course permissions from the catalogue, checked by code (MDRS-228). The route
 * matrix (`SCOPES`) knows the course's roles — köşk manager, müderris,
 * enrolled — but not the permissions a ders nazırı is given on the köşk's
 * İzinler page (MDRS-172), so a handler that one of those permissions must
 * open asks here instead.
 *
 * Held when the caller is the başnazım (SYSTEM_ADMIN), when a role they hold
 * in or above the course carries the code by default (`standingCarries`), or
 * when they hold a course grant of it — a single permission or a group that
 * names it — in this course or in every course (a course grant without an
 * id, MDRS-171). That is the reading `/me/effective-permissions` gives the
 * person on the account screen.
 *
 * Interim: MDRS-135 (#177) replaces this with `AuthzService.can(user,
 * resource, code)`, whose engine reads the same catalogue codes with scope
 * nesting, and the route then names `session.live_link` in its `@Authz`.
 */
@Injectable()
export class CourseAccessService {
  // All three must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly courseRepo: CourseRepository,
    private readonly koskService: KoskService
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  async holds(
    user: AuthenticatedUser,
    courseId: string,
    code: PermissionCode
  ): Promise<boolean> {
    // Existence first, for the başnazım too: the guard's resolver, which
    // answers a missing course with 404 for everyone else, is bypassed for
    // SYSTEM_ADMIN.
    const koskId = await this.courseRepo.findKoskId(courseId);
    if (koskId === null) throw new CourseNotFoundError(courseId);
    if (isSystemAdmin(user)) return true;
    const [koskNazim, muderris] = await Promise.all([
      this.koskService.isManager(koskId, user.sub),
      this.courseRepo.isMuderris(courseId, user.sub),
    ]);
    if (standingCarries({ koskNazim, muderris }, code)) return true;
    return this.holdsByGrant(user.sub, courseId, code);
  }

  /** Throws 403 unless the caller holds `code` in the course. */
  async assert(
    user: AuthenticatedUser,
    courseId: string,
    code: PermissionCode
  ): Promise<void> {
    if (await this.holds(user, courseId, code)) return;
    // No context: a lesson route would otherwise tell a stranger which course
    // the lesson belongs to.
    throw new AuthzForbiddenError(
      `Caller does not hold ${code} in this course`
    );
  }

  private async holdsByGrant(
    userId: string,
    courseId: string,
    code: PermissionCode
  ): Promise<boolean> {
    const grants = await this.db
      .select({
        permission: permissionGrants.permission,
        groupId: permissionGrants.groupId,
      })
      .from(permissionGrants)
      .where(
        and(
          eq(permissionGrants.userId, userId),
          eq(permissionGrants.scopeType, SCOPE_TYPES.COURSE),
          or(
            eq(permissionGrants.scopeId, courseId),
            isNull(permissionGrants.scopeId)
          ),
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
}
