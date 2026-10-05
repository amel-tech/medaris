import {
  ASSIGNED_ROLES,
  type AssignedRole,
  type AuthzMeta,
  ENTITIES,
  type Entity,
  effectivePermissions,
  type PermissionCode,
  RELATIONS,
  ROLE_DEFAULT_PERMISSIONS,
  SCOPE_TYPES,
  type ScopeRef,
} from "@medaris/common";

/**
 * What the route specs ask the catalogue (MDRS-135): which permissions a route
 * needs, and which roles hold one of them. They replace the table lookups the
 * specs made before (a role's row of the old static table), and answer from the same
 * computation the guard decides with, so a spec and a request cannot disagree.
 */

export const permissionsOf = (meta: AuthzMeta): readonly PermissionCode[] =>
  typeof meta.permission === "string" ? [meta.permission] : meta.permission;

const KOSK = "11111111-1111-4111-8111-111111111111";
const MADRASAH = "22222222-2222-4222-8222-222222222222";
const COURSE = "33333333-3333-4333-8333-333333333333";
const platform: ScopeRef = { type: SCOPE_TYPES.PLATFORM, id: null };

const scopeOf = (role: AssignedRole): ScopeRef => {
  switch (role) {
    case ASSIGNED_ROLES.MEDARIS_NAZIM:
      return platform;
    case ASSIGNED_ROLES.KOSK_NAZIM:
      return { type: SCOPE_TYPES.KOSK, id: KOSK };
    case ASSIGNED_ROLES.MEDRESE_BASMUDERRIS:
    case ASSIGNED_ROLES.MEDRESE_NAZIR:
      return { type: SCOPE_TYPES.MADRASAH, id: MADRASAH };
    default:
      return { type: SCOPE_TYPES.COURSE, id: COURSE };
  }
};

/** What a person holding only `role`, and nothing granted, may do on a resource of `entity`. */
export function heldByRole(
  role: AssignedRole,
  entity: Entity,
  options: { madrasahCourse?: boolean } = {}
): ReadonlySet<PermissionCode> {
  const madrasahCourse = options.madrasahCourse ?? false;
  const course: ScopeRef = { type: SCOPE_TYPES.COURSE, id: COURSE };
  const kosk: ScopeRef = { type: SCOPE_TYPES.KOSK, id: KOSK };
  const madrasah: ScopeRef = { type: SCOPE_TYPES.MADRASAH, id: MADRASAH };
  const chain: ScopeRef[] =
    entity === ENTITIES.COURSE
      ? madrasahCourse
        ? [course, madrasah, kosk, platform]
        : [course, kosk, platform]
      : entity === ENTITIES.KOSK
        ? [kosk, platform]
        : entity === ENTITIES.MADRASAH
          ? [madrasah, platform]
          : [platform];
  return effectivePermissions(
    {
      entity,
      relation: RELATIONS.PUBLIC,
      chain,
      madrasahCourse,
      passiveScope: null,
      policies: [],
    },
    [{ role, scope: scopeOf(role) }],
    []
  ).codes;
}

/** The roles that, with no grant, hold at least one of the codes on a resource of `entity`. */
export function rolesHolding(
  codes: readonly PermissionCode[],
  entity: Entity,
  options: { madrasahCourse?: boolean } = {}
): AssignedRole[] {
  return (Object.values(ASSIGNED_ROLES) as AssignedRole[])
    .filter((role) => {
      const held = heldByRole(role, entity, options);
      return codes.some((code) => held.has(code));
    })
    .sort();
}

/** The roles whose own defaults carry the code, wherever it is held. */
export const rolesWithDefault = (code: PermissionCode): AssignedRole[] =>
  (Object.values(ASSIGNED_ROLES) as AssignedRole[])
    .filter((role) => ROLE_DEFAULT_PERMISSIONS[role].includes(code))
    .sort();
