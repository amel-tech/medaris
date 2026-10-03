import {
  type AssignedRole,
  SCOPE_TYPES,
  type ScopeRef,
  type ScopeType,
} from "./assignments";
import {
  PERMISSION_META,
  PERMISSIONS,
  type PermissionCode,
  ROLE_DEFAULT_PERMISSIONS,
} from "./permissions";
import { authorityAbove, type IPolicyOn, POLICY_CLOSES } from "./policies";
import { type Relation, relationCodes } from "./relations";
import { ENTITIES, type Entity } from "./scopes";

/**
 * A role the caller holds. The loader's queries already leave out what is
 * revoked or past its end, against the database clock; `expiresAt` is carried
 * as well so this function never trusts a row that has run out, whoever built
 * the list.
 */
export interface IHeldRole {
  role: AssignedRole;
  scope: ScopeRef;
  expiresAt?: Date | null;
}

/**
 * A grant the caller holds right now, with the codes it carries (a group's
 * codes are already expanded) and the level of the authority that made it. A
 * grant that predates the authority column has none and counts as made at its
 * own scope's level.
 */
export interface IHeldGrantCodes {
  scope: ScopeRef;
  codes: readonly PermissionCode[];
  authority: ScopeType | null;
  expiresAt?: Date | null;
}

/** What the loader found out about the resource a decision is about. */
export interface IAuthzFacts {
  entity: Entity;
  relation: Relation;
  /** The scopes the resource sits in, narrowest first, always ending with the platform. */
  chain: readonly ScopeRef[];
  /** The course is held for a medrese: it sits in both its köşk and its medrese. */
  madrasahCourse: boolean;
  /** The first passive scope in the chain, or null. */
  passiveScope: ScopeRef | null;
  /** Policies that are on in the chain. */
  policies: readonly IPolicyOn[];
}

export interface IEffective {
  codes: ReadonlySet<PermissionCode>;
  /** The passive scope the caller opened as platform management, or null. */
  openedPassive: ScopeRef | null;
}

const sameScope = (a: ScopeRef, b: ScopeRef) =>
  a.type === b.type && a.id === b.id;

/**
 * Whether a role held at `outer` is a role in `inner` or above it: the same
 * scope, the platform over everything, or a köşk or medrese over a course (a
 * köşk is not above a medrese, nor the other way round). Both are on the
 * resource's chain already.
 */
export function roleCoversScope(
  outer: ScopeRef,
  inner: ScopeRef,
  /**
   * Where a course sits, for a caller that has no resource chain to lean on (the
   * account screen). The engine leaves it out: it has already cut everything
   * down to the resource's own chain.
   */
  parentsOfCourse?: (courseId: string) => {
    koskId?: string | null;
    madrasahId?: string | null;
  } | null
): boolean {
  if (outer.type === SCOPE_TYPES.PLATFORM) return true;
  if (inner.type === SCOPE_TYPES.PLATFORM) return false;
  if (outer.type === inner.type) {
    return inner.id === null || outer.id === inner.id;
  }
  if (
    inner.type !== SCOPE_TYPES.COURSE ||
    (outer.type !== SCOPE_TYPES.KOSK && outer.type !== SCOPE_TYPES.MADRASAH)
  ) {
    return false;
  }
  if (!parentsOfCourse || inner.id === null) return true;
  const parents = parentsOfCourse(inner.id);
  if (!parents) return false;
  return (
    outer.id ===
    (outer.type === SCOPE_TYPES.KOSK ? parents.koskId : parents.madrasahId)
  );
}

/** Where in the chain a scope sits, or -1. Narrower scopes have the smaller index. */
function chainIndex(chain: readonly ScopeRef[], scope: ScopeRef): number {
  if (scope.type === SCOPE_TYPES.PLATFORM) {
    return chain.findIndex((c) => c.type === SCOPE_TYPES.PLATFORM);
  }
  // A grant without an id is held in every scope of its type.
  if (scope.id === null) return chain.findIndex((c) => c.type === scope.type);
  return chain.findIndex((c) => sameScope(c, scope));
}

/**
 * Whether a code held at a scope of `type` reaches the resource: it is tagged
 * for that kind of scope, or it is course work held in a köşk or a medrese,
 * which reaches that scope's courses (nesting: platform ⊃ köşk ⊃ course and
 * platform ⊃ medrese ⊃ course).
 */
function reaches(code: PermissionCode, type: ScopeType): boolean {
  const { scopes } = PERMISSION_META[code];
  if (scopes.includes(type)) return true;
  return (
    scopes.includes(SCOPE_TYPES.COURSE) &&
    (type === SCOPE_TYPES.KOSK || type === SCOPE_TYPES.MADRASAH)
  );
}

/** A köşk-level holding does not reach what belongs to the medrese in a medrese course. */
function blockedInMadrasahCourse(
  code: PermissionCode,
  at: ScopeRef,
  facts: IAuthzFacts
): boolean {
  return (
    facts.madrasahCourse &&
    at.type === SCOPE_TYPES.KOSK &&
    PERMISSION_META[code].notInMadrasahCourse === true
  );
}

/**
 * Course-scoped codes that are no course work: finding people, defining groups
 * and the permission to give permissions. Holding only these makes nobody
 * course staff.
 */
const NOT_COURSE_WORK: ReadonlySet<PermissionCode> = new Set([
  PERMISSIONS.USER_LOOKUP,
  PERMISSIONS.PERMISSION_GROUP_DEFINE,
  PERMISSIONS.PERMISSION_GRANT,
]);

const isCourseWork = (code: PermissionCode) =>
  PERMISSION_META[code].scopes.includes(SCOPE_TYPES.COURSE) &&
  !NOT_COURSE_WORK.has(code);

/**
 * What the caller may do on the resource (MDRS-135 §6 and §7), as one pure
 * computation so the API, the account screens and the tests cannot disagree:
 *
 *   (relationship ∪ role defaults ∪ held grants) ∩ policies ∩ passive scope
 *
 * - a role contributes its defaults in the scopes it is held in and the scopes
 *   below them;
 * - a grant contributes its codes while the caller still holds a role in its
 *   scope or above it (a permission never outlasts its role), and a grant
 *   made by an authority above a policy's level survives that policy;
 * - a policy that is on closes the abilities it names in every scope below;
 * - a passive scope closes every content code, except to platform management
 *   holding `platform.inactive_scopes_manage`, whose open is audited by the
 *   caller of this function.
 */
export function effectivePermissions(
  facts: IAuthzFacts,
  allRoles: readonly IHeldRole[],
  allGrants: readonly IHeldGrantCodes[],
  now: Date = new Date()
): IEffective {
  const live = (end: Date | null | undefined) =>
    end === null || end === undefined || end.getTime() > now.getTime();
  const roles = allRoles.filter((r) => live(r.expiresAt));
  const grants = allGrants.filter((g) => live(g.expiresAt));
  const codes = new Set<PermissionCode>(
    relationCodes(facts.entity, facts.relation)
  );

  const heldRoles = roles.filter((r) => chainIndex(facts.chain, r.scope) >= 0);
  for (const held of heldRoles) {
    for (const code of ROLE_DEFAULT_PERMISSIONS[held.role]) {
      if (blockedInMadrasahCourse(code, held.scope, facts)) continue;
      codes.add(code);
    }
  }

  // code -> the authorities of the live grants that carry it, for the bypass.
  const grantedBy = new Map<PermissionCode, ScopeType[]>();
  for (const grant of grants) {
    if (chainIndex(facts.chain, grant.scope) < 0) continue;
    if (!heldRoles.some((r) => roleCoversScope(r.scope, grant.scope))) continue;
    const authority = grant.authority ?? grant.scope.type;
    for (const code of grant.codes) {
      if (!PERMISSION_META[code].grantable) continue;
      if (!reaches(code, grant.scope.type)) continue;
      if (blockedInMadrasahCourse(code, grant.scope, facts)) continue;
      codes.add(code);
      const list = grantedBy.get(code) ?? [];
      list.push(authority);
      grantedBy.set(code, list);
    }
  }

  // Course staff: whoever holds any course work in the course reads its
  // talebeler and sees the content ("bu ayrı bir izin değildir", tedris/43).
  if (facts.entity === ENTITIES.COURSE && [...codes].some(isCourseWork)) {
    codes.add(PERMISSIONS.COURSE_STAFF_READ);
    codes.add(PERMISSIONS.COURSE_VIEW_DETAILS);
  }

  // Derived abilities ride on the permission they are part of.
  for (const code of Object.values(PERMISSIONS)) {
    const from = PERMISSION_META[code].derivedFrom;
    if (from && codes.has(from)) codes.add(code);
  }

  // Policies close abilities below them. A grant made by an authority above
  // the policy's level survives it: that is how a higher authority widens one
  // person beyond a policy. A derived ability survives through a grant of the
  // permission it is part of.
  for (const policy of facts.policies) {
    for (const code of POLICY_CLOSES[policy.key]) {
      const sources = [code, PERMISSION_META[code].derivedFrom];
      const survives = sources.some((source) =>
        (source ? (grantedBy.get(source) ?? []) : []).some((authority) =>
          authorityAbove(authority, policy.level)
        )
      );
      if (!survives) codes.delete(code);
    }
  }

  // A passive scope closes its content.
  let openedPassive: ScopeRef | null = null;
  if (facts.passiveScope) {
    const management = codes.has(PERMISSIONS.PLATFORM_INACTIVE_SCOPES_MANAGE);
    if (management) {
      // Opening is the whole point of the permission: the Medaris nazımı who
      // holds it reads the content even though no role of theirs reaches it
      // (nizam/14: "yalnız Medaris başnazımı ve izni olan Medaris nazımları
      // açabilir, her açış denetim kaydına yazılır").
      openedPassive = facts.passiveScope;
      codes.add(PERMISSIONS.COURSE_VIEW_DETAILS);
      codes.add(PERMISSIONS.COURSE_STAFF_READ);
    } else {
      for (const code of [...codes]) {
        if (PERMISSION_META[code].content) codes.delete(code);
      }
    }
  }

  return { codes, openedPassive };
}
