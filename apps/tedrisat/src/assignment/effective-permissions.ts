import type {
  AssignedRole,
  ScopeType,
} from "../database/schema/role-assignment.schema";
import { ROLE_DEFAULT_PERMISSIONS } from "./permission-catalog";

export interface IScopeRef {
  type: ScopeType;
  id: string | null;
  name: string | null;
}

export interface IHeldRole extends IScopeRef {
  role: AssignedRole;
}

export interface IHeldPermissions extends IScopeRef {
  /** Catalog codes the grant (or the grant's group) carries. */
  codes: readonly string[];
}

export interface IEffectiveGroup {
  /** Null for scopes where the caller holds a grant but no role. */
  role: AssignedRole | null;
  scopeType: ScopeType;
  scopes: IScopeRef[];
  permissions: string[];
}

const keyOf = (scope: IScopeRef) => `${scope.type}:${scope.id ?? ""}`;

/**
 * What a person may do, sorted by where. A role contributes its defaults in
 * the scopes it is held in; a grant contributes its codes in its own scope.
 * Scopes held under the same role are one group, so a müderris of four
 * courses reads as one set of sentences, not four (tedris 43). A grant in a
 * scope where no role is held forms a group with `role: null`.
 *
 * Pure on purpose: the same rule is exercised without a database.
 */
export function buildEffectivePermissions(
  roles: readonly IHeldRole[],
  grants: readonly IHeldPermissions[]
): IEffectiveGroup[] {
  const grantedByScope = new Map<string, Set<string>>();
  const scopeOfGrant = new Map<string, IScopeRef>();
  for (const grant of grants) {
    const key = keyOf(grant);
    const set = grantedByScope.get(key) ?? new Set<string>();
    for (const code of grant.codes) set.add(code);
    grantedByScope.set(key, set);
    scopeOfGrant.set(key, {
      type: grant.type,
      id: grant.id,
      name: grant.name,
    });
  }

  const groups = new Map<string, IEffectiveGroup>();
  const rolesInScope = new Set<string>();
  for (const held of roles) {
    rolesInScope.add(keyOf(held));
    const key = `${held.role}`;
    const group = groups.get(key) ?? {
      role: held.role,
      scopeType: held.type,
      scopes: [],
      permissions: [],
    };
    if (!group.scopes.some((s) => keyOf(s) === keyOf(held))) {
      group.scopes.push({ type: held.type, id: held.id, name: held.name });
    }
    const merged = new Set<string>(group.permissions);
    for (const code of ROLE_DEFAULT_PERMISSIONS[held.role]) merged.add(code);
    for (const code of grantedByScope.get(keyOf(held)) ?? []) merged.add(code);
    group.permissions = [...merged];
    groups.set(key, group);
  }

  for (const [key, codes] of grantedByScope) {
    if (rolesInScope.has(key)) continue;
    const scope = scopeOfGrant.get(key);
    if (!scope) continue;
    const groupKey = `grant:${scope.type}`;
    const group = groups.get(groupKey) ?? {
      role: null,
      scopeType: scope.type,
      scopes: [],
      permissions: [],
    };
    group.scopes.push(scope);
    group.permissions = [...new Set([...group.permissions, ...codes])];
    groups.set(groupKey, group);
  }

  return [...groups.values()].filter((group) => group.permissions.length > 0);
}

/** Every distinct code across the groups, in first-seen order. */
export function flattenPermissions(
  groups: ReadonlyArray<{ permissions: readonly string[] }>
): string[] {
  return [...new Set(groups.flatMap((group) => group.permissions))];
}
