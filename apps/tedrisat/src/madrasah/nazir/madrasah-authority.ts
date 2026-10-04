import {
  type AuthenticatedUser,
  type AuthzService,
  ENTITIES,
  PERMISSIONS,
} from "@medaris/common";
import {
  SCOPE_TYPES,
  type ScopeType,
} from "../../database/schema/role-assignment.schema";

/**
 * The level the caller manages this medrese's nazırs at, or null: the başnazım
 * acts as the platform; the medrese's başmüderris as the medrese, from the
 * `permission.grant` their role holds (never a grant: what you were given you
 * cannot give on); a Medaris nazımı holding `platform.madrasah_nazir_grant` as
 * the platform. Someone who is both a başmüderris and such a Medaris nazımı
 * acts as the medrese on every route, so one delegation is recorded at one
 * level. A nazır who merely holds `madrasah.nazir_appoint` gets null: they
 * appoint at the medrese's level and give nothing.
 *
 * Every route that appoints, gives or dismisses asks this one function, so
 * the levels they record cannot disagree.
 */
export async function madrasahAuthorityOf(
  authz: AuthzService,
  user: AuthenticatedUser,
  madrasahId: string
): Promise<ScopeType | null> {
  if (authz.isSystemAdmin(user)) return SCOPE_TYPES.PLATFORM;
  const resource = { entity: ENTITIES.MADRASAH, id: madrasahId };
  if (await authz.can(user, resource, PERMISSIONS.PERMISSION_GRANT)) {
    return SCOPE_TYPES.MADRASAH;
  }
  if (
    await authz.can(user, resource, PERMISSIONS.PLATFORM_MADRASAH_NAZIR_GRANT)
  ) {
    return SCOPE_TYPES.PLATFORM;
  }
  return null;
}
