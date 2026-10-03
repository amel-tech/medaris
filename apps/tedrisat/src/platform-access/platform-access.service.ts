import { AuthenticatedUser, AuthzForbiddenError, ROLES } from "@medaris/common";
import { Injectable, Module } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import { grantHeld } from "../assignment/assignment.repository";
import type { PermissionCode } from "../assignment/permission-catalog";
import { DatabaseModule } from "../database/database.module";
import { DatabaseService } from "../database/database.service";
import { isHeld } from "../database/role-assignments";
import {
  permissionGrants,
  permissionGroupItems,
} from "../database/schema/permission.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
  SCOPE_TYPES,
} from "../database/schema/role-assignment.schema";

/** The başnazım is the realm's SYSTEM_ADMIN role, read off the token as `AuthzService` does. */
export const isSystemAdmin = (user: AuthenticatedUser): boolean => {
  const roles = user.realm_access?.roles;
  return Array.isArray(roles) && roles.includes(ROLES.SYSTEM_ADMIN);
};

/**
 * Who may use the Medaris management screens (MDRS-181): the başnazım
 * (SYSTEM_ADMIN), or a Medaris nazımı who was given the platform permission,
 * by a single grant or through a group. Every other caller is a 403, which
 * the web app shows as "Bu bölüm için izniniz yok" (nizam/06).
 */
@Injectable()
export class PlatformAccessService {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  //
  // No `AuthzService` here: its role resolver reads through `KoskService`,
  // which writes to the audit trail through this class, so injecting it would
  // close a provider cycle that Nest answers by never finishing `compile()`.
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /** Returns the caller's id, or throws 403. */
  async assert(user: AuthenticatedUser, code: PermissionCode): Promise<string> {
    if (isSystemAdmin(user)) return user.sub;
    if (await this.holds(user.sub, code)) return user.sub;
    throw new AuthzForbiddenError(
      `Only the Medaris başnazımı and a Medaris nazımı holding ${code} may do this`
    );
  }

  /** Whether the user is a Medaris nazımı holding the permission. */
  async holds(userId: string, code: PermissionCode): Promise<boolean> {
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
}

@Module({
  imports: [DatabaseModule],
  providers: [PlatformAccessService],
  exports: [PlatformAccessService],
})
export class PlatformAccessModule {}
