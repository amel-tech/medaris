import {
  AuthenticatedUser,
  AuthzForbiddenError,
  ENTITIES,
  effectivePermissions,
  RELATIONS,
  ROLES,
} from "@medaris/common";
import { Injectable, Module } from "@nestjs/common";
import type { PermissionCode } from "../assignment/permission-catalog";
import { TedrisatAuthzContext } from "../authz/tedrisat-authz-context.service";
import { DatabaseModule } from "../database/database.module";

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
 *
 * The answer is the engine's: the same computation `AuthzService` decides with
 * (`effectivePermissions` over the platform chain), so a grant needs the
 * Medaris nazımı's role under it, a lapsed role or grant counts for nothing,
 * and a group's codes count like single ones — written once, not here as well.
 */
@Injectable()
export class PlatformAccessService {
  // Must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  //
  // No `AuthzService` here: its role resolver reads through `KoskService`,
  // which writes to the audit trail through this class, so injecting it would
  // close a provider cycle that Nest answers by never finishing `compile()`.
  // The context loader reads through `DatabaseService` alone, which is why it
  // can be used from here.
  constructor(private readonly context: TedrisatAuthzContext) {}

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
    // "any" is no id: the loader answers the platform chain alone.
    const ctx = await this.context.load(userId, {
      entity: ENTITIES.KOSK,
      id: "any",
    });
    const { codes } = effectivePermissions(
      {
        entity: ENTITIES.KOSK,
        relation: RELATIONS.PUBLIC,
        chain: ctx.chain,
        madrasahCourse: false,
        passiveScope: null,
        policies: ctx.policies,
      },
      ctx.roles,
      ctx.grants
    );
    return codes.has(code);
  }
}

@Module({
  imports: [DatabaseModule],
  providers: [TedrisatAuthzContext, PlatformAccessService],
  exports: [PlatformAccessService],
})
export class PlatformAccessModule {}
