import {
  type AssignedRole,
  ENTITIES,
  effectivePermissions,
  type IAuthzFacts,
  type IHeldGrantCodes,
  type IHeldRole,
  PERMISSION_META,
  type PermissionCode,
  RELATIONS,
  SCOPE_TYPES,
  type ScopeRef,
  type ScopeType,
} from "@medaris/common";

/** What `GET /me` knows about one scope: its name and, for a course, where it sits. */
export interface IMeScopeInfo {
  name: string | null;
  koskId?: string | null;
  madrasahId?: string | null;
}

export interface IMeScope {
  scopeType: ScopeType;
  scopeId: string | null;
  scopeName: string | null;
  /** The roles held in exactly this scope. */
  roles: AssignedRole[];
  /** The engine's answer for this scope, sorted, the implicit codes left out. */
  permissions: PermissionCode[];
}

const PLATFORM: ScopeRef = { type: SCOPE_TYPES.PLATFORM, id: null };

const TYPE_ORDER: Record<ScopeType, number> = {
  [SCOPE_TYPES.PLATFORM]: 0,
  [SCOPE_TYPES.KOSK]: 1,
  [SCOPE_TYPES.MADRASAH]: 2,
  [SCOPE_TYPES.COURSE]: 3,
};

const keyOf = (scope: ScopeRef) => `${scope.type}:${scope.id ?? ""}`;

/**
 * The scopes a resource sits in, narrowest first, as the engine's loader
 * builds them, for a scope the caller holds something in. Policies and the
 * passive-scope closure are left out on purpose: `GET /me` says what the
 * caller holds, and the routes still refuse what a policy or a passive scope
 * closes (the policies only close implicit codes, which are not listed).
 */
function factsOf(scope: ScopeRef, info: IMeScopeInfo): IAuthzFacts {
  const base = {
    relation: RELATIONS.PUBLIC,
    passiveScope: null,
    policies: [],
  };
  switch (scope.type) {
    case SCOPE_TYPES.COURSE:
      return {
        ...base,
        entity: ENTITIES.COURSE,
        madrasahCourse: Boolean(info.madrasahId),
        chain: [
          scope,
          ...(info.madrasahId
            ? [{ type: SCOPE_TYPES.MADRASAH, id: info.madrasahId }]
            : []),
          ...(info.koskId ? [{ type: SCOPE_TYPES.KOSK, id: info.koskId }] : []),
          PLATFORM,
        ],
      };
    case SCOPE_TYPES.KOSK:
      return {
        ...base,
        entity: ENTITIES.KOSK,
        madrasahCourse: false,
        chain: [scope, PLATFORM],
      };
    case SCOPE_TYPES.MADRASAH:
      return {
        ...base,
        entity: ENTITIES.MADRASAH,
        madrasahCourse: false,
        chain: [scope, PLATFORM],
      };
    default:
      // The platform has no entity of its own; a köşk id that is no id answers
      // the platform chain alone, as `PlatformAccessService` does.
      return {
        ...base,
        entity: ENTITIES.KOSK,
        madrasahCourse: false,
        chain: [PLATFORM],
      };
  }
}

/**
 * What the caller holds, scope by scope (MDRS-142): one entry for every scope
 * they hold a role in, and for every scope below a role they hold a grant in.
 * Each is the engine's own computation (`effectivePermissions`) over the
 * scope's chain with everything the caller holds, so a grant counts only while
 * a role covers it, "every course" grants count in the courses a role is held
 * in, a köşk's entry lists the course work held across its courses, and the
 * route that answers the same question can never disagree. Pure, and fed with
 * the two reads `TedrisatAuthzContext.holdings` makes: the number of scopes
 * adds no query.
 *
 * `lookup` names a scope, or answers null for one that no longer exists
 * (`scope_id` is no foreign key, so a role can outlive its köşk): such a scope
 * has no entry. A scope with no role and no code is left out too: a grant
 * under no role counts for nothing.
 */
export function permissionsPerScope(
  allRoles: readonly IHeldRole[],
  allGrants: readonly IHeldGrantCodes[],
  lookup: (scope: ScopeRef) => IMeScopeInfo | null,
  now: Date = new Date()
): IMeScope[] {
  // The loader leaves out what has run out against the database clock; this
  // never lists one whoever built the arrays, as the engine does not count it.
  const live = (end: Date | null | undefined) =>
    end === null || end === undefined || end.getTime() > now.getTime();
  const roles = allRoles.filter((r) => live(r.expiresAt));
  const grants = allGrants.filter((g) => live(g.expiresAt));
  const scopes = new Map<string, ScopeRef>();
  // A grant for "every course" has no id: `lookup` knows no such scope, so it
  // gets no entry of its own and only counts in the courses a role is held in.
  for (const { scope } of [...roles, ...grants])
    scopes.set(keyOf(scope), scope);

  const entries: IMeScope[] = [];
  for (const scope of scopes.values()) {
    const info =
      scope.type === SCOPE_TYPES.PLATFORM ? { name: null } : lookup(scope);
    if (!info) continue;
    const held = effectivePermissions(factsOf(scope, info), roles, grants, now);
    const permissions = [...held.codes]
      .filter((code) => !PERMISSION_META[code].implicit)
      .sort();
    const here = roles
      .filter((r) => keyOf(r.scope) === keyOf(scope))
      .map((r) => r.role);
    const rolesHere = [...new Set(here)].sort();
    if (rolesHere.length === 0 && permissions.length === 0) continue;
    entries.push({
      scopeType: scope.type,
      scopeId: scope.id,
      scopeName: info.name,
      roles: rolesHere,
      permissions,
    });
  }
  return entries.sort(
    (a, b) =>
      TYPE_ORDER[a.scopeType] - TYPE_ORDER[b.scopeType] ||
      (a.scopeName ?? "").localeCompare(b.scopeName ?? "", "tr") ||
      (a.scopeId ?? "").localeCompare(b.scopeId ?? "")
  );
}
