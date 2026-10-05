import {
  ASSIGNED_ROLES,
  type AssignedRole,
  type AuthzService,
  type IHeldGrantCodes,
  type IHeldRole,
  type PermissionCode,
  SCOPE_TYPES,
  type ScopeRef,
} from "@medaris/common";
import type { TedrisatAuthzContext } from "../../src/authz/tedrisat-authz-context.service";
import { BanAuthority } from "../../src/ban/ban-authority";

/**
 * What the ban specs hand the engine (MDRS-205): a caller's roles and grants,
 * for a `BanAuthority` that decides from the real catalogue, so a spec says "a
 * ders nazırı granted ban.course" and not which flag the service would set.
 */
export interface IBanPlaces {
  koskId?: string;
  courseId?: string;
  madrasahId?: string;
}

/** A role held where it is held: the platform for a Medaris nazımı, else the scope named. */
export function heldRole(role: AssignedRole, where: IBanPlaces): IHeldRole {
  const scope = ((): ScopeRef => {
    switch (role) {
      case ASSIGNED_ROLES.MEDARIS_NAZIM:
        return { type: SCOPE_TYPES.PLATFORM, id: null };
      case ASSIGNED_ROLES.KOSK_NAZIM:
        return { type: SCOPE_TYPES.KOSK, id: where.koskId ?? "no-kosk" };
      case ASSIGNED_ROLES.MEDRESE_BASMUDERRIS:
      case ASSIGNED_ROLES.MEDRESE_NAZIR:
        return {
          type: SCOPE_TYPES.MADRASAH,
          id: where.madrasahId ?? "no-madrasah",
        };
      default:
        return { type: SCOPE_TYPES.COURSE, id: where.courseId ?? "no-course" };
    }
  })();
  return { role, scope };
}

/** A grant of codes at a scope (the platform when `scope` is omitted). */
export const grantOf = (
  codes: PermissionCode[],
  scope: ScopeRef = { type: SCOPE_TYPES.PLATFORM, id: null }
): IHeldGrantCodes => ({ scope, codes, authority: null });

/** A `BanAuthority` over the holdings given; `admin` is the başnazım's realm role. */
export function authorityOf(
  roles: IHeldRole[] = [],
  grants: IHeldGrantCodes[] = [],
  admin = false
): BanAuthority {
  return new BanAuthority(
    { isSystemAdmin: () => admin } as unknown as AuthzService,
    {
      holdings: async () => ({ roles, grants }),
    } as unknown as TedrisatAuthzContext
  );
}
