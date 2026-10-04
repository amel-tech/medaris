import {
  LISTED_CODES,
  PERMISSION_META,
  type PermissionCode,
} from "@medaris/common";
import {
  ASSIGNED_ROLES,
  type AssignedRole,
  SCOPE_TYPES,
  type ScopeType,
} from "../database/schema/role-assignment.schema";

export interface IScopeRef {
  type: ScopeType;
  id: string | null;
  name: string | null;
}

/** One scope a role or a grant of the person names, and what they hold there. */
export interface IScopeHolding extends IScopeRef {
  /** The roles held in this very scope; none for a scope only a grant names. */
  roles: readonly AssignedRole[];
  /**
   * What the engine says the person holds here (`AuthzService.effective`):
   * role defaults with nesting, the grants a role still covers, and the
   * content a passive scope has closed taken away.
   */
  codes: ReadonlySet<string>;
}

export interface IEffectiveGroup {
  /** Null for scopes where the caller holds a grant but no role. */
  role: AssignedRole | null;
  scopeType: ScopeType;
  scopes: IScopeRef[];
  permissions: string[];
}

/** The role a scope's lines are drawn under when more than one is held there: its manager first. */
const ROLE_ORDER: readonly AssignedRole[] = [
  ASSIGNED_ROLES.KOSK_NAZIM,
  ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
  ASSIGNED_ROLES.MUDERRIS,
  ASSIGNED_ROLES.MEDARIS_NAZIM,
  ASSIGNED_ROLES.MEDRESE_NAZIR,
  ASSIGNED_ROLES.DERS_NAZIR,
];

/**
 * Whether a code the person holds is one of the lines of a scope of `type`:
 * a code tagged for that kind of scope, or, at a medrese or a köşk, the course
 * work held there for every course below it (a başmüderris's runs the
 * medrese's courses). The köşk nazımı's own course work is the one exception:
 * `course.manage_all` says it in one sentence, with the role's note under it,
 * and it is not repeated line by line.
 */
export function listedAt(
  code: PermissionCode,
  type: ScopeType,
  roles: readonly AssignedRole[]
): boolean {
  const { scopes } = PERMISSION_META[code];
  if (scopes.includes(type)) return true;
  if (type !== SCOPE_TYPES.KOSK && type !== SCOPE_TYPES.MADRASAH) return false;
  if (!scopes.includes(SCOPE_TYPES.COURSE)) return false;
  return !(
    type === SCOPE_TYPES.KOSK && roles.includes(ASSIGNED_ROLES.KOSK_NAZIM)
  );
}

/**
 * What a person may do, sorted by where, as the engine decides it: each scope
 * a role or a grant names lists the catalogue's listed codes the engine gives
 * the person there (`listedAt` picks the ones that are that scope's lines), so
 * this screen and a request cannot disagree. A passive scope's closed content,
 * a grant to "every course", a grant no role covers and a code whose scope tag
 * does not reach the scope are therefore all exactly what the routes do.
 *
 * Scopes held under the same role with the same lines are one group, so a
 * müderris of four courses reads as one set of sentences, not four (tedris
 * 43); a course of theirs that went passive is a group of its own. A scope
 * where only a grant is held forms a group with `role: null`.
 *
 * Pure on purpose: the grouping is exercised without a database.
 */
export function buildEffectivePermissions(
  holdings: readonly IScopeHolding[]
): IEffectiveGroup[] {
  const groups = new Map<string, IEffectiveGroup>();
  for (const holding of holdings) {
    const role = ROLE_ORDER.find((r) => holding.roles.includes(r)) ?? null;
    const permissions = LISTED_CODES.filter(
      (code) =>
        holding.codes.has(code) && listedAt(code, holding.type, holding.roles)
    );
    if (permissions.length === 0) continue;
    const key = `${role ?? `grant:${holding.type}`}|${permissions.join(",")}`;
    const group = groups.get(key) ?? {
      role,
      scopeType: holding.type,
      scopes: [],
      permissions,
    };
    if (
      !group.scopes.some((s) => s.type === holding.type && s.id === holding.id)
    ) {
      group.scopes.push({
        type: holding.type,
        id: holding.id,
        name: holding.name,
      });
    }
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Every distinct code across the groups, in first-seen order. */
export function flattenPermissions(
  groups: ReadonlyArray<{ permissions: readonly string[] }>
): string[] {
  return [...new Set(groups.flatMap((group) => group.permissions))];
}
