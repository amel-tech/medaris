import {
  ASSIGNED_ROLES,
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
  /** The passive scope the caller opened as platform management or as its köşk's nazımı, or null. */
  openedPassive: ScopeRef | null;
  /**
   * For each code a live grant carries here, the authorities of those grants:
   * what a policy lets through for this caller, and so the most a giver may
   * hand the code on with (owner, d-1004-27 "tavan kazanır"). A code held only
   * by a role or a relationship is absent.
   */
  grantAuthorities?: ReadonlyMap<PermissionCode, readonly ScopeType[]>;
  /**
   * The same grants with how long each holding lasts: the grant's own end or
   * the end of the role that lets it count, whichever comes first (null: no
   * end). A giver hands a code on with an authority only for as long as they
   * hold it with that authority (d-1004-27).
   */
  grantHoldings?: ReadonlyMap<PermissionCode, readonly IGrantHolding[]>;
}

/** One live grant of a code: the authority behind it, and until when it is held. */
export interface IGrantHolding {
  authority: ScopeType;
  until: Date | null;
}

/** The later of some ends; null (no end) when any of them has none. */
function latestEnd(ends: ReadonlyArray<Date | null | undefined>): Date | null {
  if (ends.some((end) => end === null || end === undefined)) return null;
  return new Date(Math.max(...ends.map((end) => (end as Date).getTime())));
}

/** The earlier of two ends, where null is no end. */
function earliestEnd(a: Date | null, b: Date | null): Date | null {
  if (a === null) return b;
  if (b === null) return a;
  return a.getTime() <= b.getTime() ? a : b;
}

/** Ids compare lower-cased: a path may spell a uuid in upper case. */
const sameId = (a: string | null, b: string | null) =>
  a === b || (a !== null && b !== null && a.toLowerCase() === b.toLowerCase());

const sameScope = (a: ScopeRef, b: ScopeRef) =>
  a.type === b.type && sameId(a.id, b.id);

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
    return inner.id === null || sameId(outer.id, inner.id);
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
  return sameId(
    outer.id,
    (outer.type === SCOPE_TYPES.KOSK ? parents.koskId : parents.madrasahId) ??
      null
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
 * The course work that is done on the talebeler: deciding on, removing and
 * completing enrollments. Whoever holds one of these reads the course's
 * talebe list (names and e-mails), which is the same work seen from the list.
 * Nothing else implies it: a grant of `week.hide`, `ban.course` or
 * `deck.propose_kosk` is no reason to open the roster (review M1).
 */
const ROSTER_WORK: ReadonlySet<PermissionCode> = new Set([
  PERMISSIONS.ENROLLMENT_DECIDE,
  PERMISSIONS.ENROLLMENT_REMOVE,
  PERMISSIONS.ENROLLMENT_COMPLETE,
]);

/**
 * The course work that is done on the course itself and its sessions: editing,
 * running sessions and their links, reading what is restricted, publishing and
 * changing its settings. Whoever holds one of these (or any roster work) sees
 * the course's details and content, which is how an editor edits ("every
 * editor may also read details"). Unrelated grants do not imply it.
 */
const CONTENT_WORK: ReadonlySet<PermissionCode> = new Set([
  PERMISSIONS.COURSE_EDIT,
  PERMISSIONS.SESSION_MANAGE,
  PERMISSIONS.SESSION_LIVE_LINK,
  PERMISSIONS.SESSION_VIEW_CONTENT,
  PERMISSIONS.RECORDING_MANAGE,
  PERMISSIONS.RECORDING_UPLOAD,
  PERMISSIONS.RECORDING_WATCH_RESTRICTED,
  PERMISSIONS.COURSE_SETTINGS,
  PERMISSIONS.COURSE_PUBLISH,
  PERMISSIONS.COURSE_VIEW_UNPUBLISHED,
]);

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
 *   holding `platform.inactive_scopes_manage` and to the nazımı of the köşk the
 *   course is held in, whose open is audited by the caller of this function.
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
  const holdings = new Map<PermissionCode, IGrantHolding[]>();
  for (const grant of grants) {
    if (chainIndex(facts.chain, grant.scope) < 0) continue;
    const covering = heldRoles.filter((r) =>
      roleCoversScope(r.scope, grant.scope)
    );
    if (covering.length === 0) continue;
    const authority = grant.authority ?? grant.scope.type;
    const until = earliestEnd(
      grant.expiresAt ?? null,
      latestEnd(covering.map((r) => r.expiresAt))
    );
    for (const code of grant.codes) {
      if (!PERMISSION_META[code].grantable) continue;
      if (!reaches(code, grant.scope.type)) continue;
      if (blockedInMadrasahCourse(code, grant.scope, facts)) continue;
      codes.add(code);
      const list = grantedBy.get(code) ?? [];
      list.push(authority);
      grantedBy.set(code, list);
      const held = holdings.get(code) ?? [];
      held.push({ authority, until });
      holdings.set(code, held);
    }
  }

  // Course staff by what they do, not by holding "any" course code: the
  // roster comes with the enrollment work and the details and content with the
  // work on the course itself ("bu ayrı bir izin değildir", tedris/43). A role's
  // defaults carry all of it, so a müderris or a köşk nazımı holds both.
  if (facts.entity === ENTITIES.COURSE) {
    const held = [...codes];
    const rosterWork = held.some((code) => ROSTER_WORK.has(code));
    if (rosterWork) codes.add(PERMISSIONS.COURSE_STAFF_READ);
    if (rosterWork || held.some((code) => CONTENT_WORK.has(code))) {
      codes.add(PERMISSIONS.COURSE_VIEW_DETAILS);
    }
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
    const passive = facts.passiveScope;
    const management = codes.has(PERMISSIONS.PLATFORM_INACTIVE_SCOPES_MANAGE);
    // The köşk nazımı is the platform's management in their own köşk (owner,
    // 4 October: "köşk nazımı zaten bir tür platform yöneticisi olduğu için
    // görebilmesi lazım"): a passive course, or a course of a passive medrese,
    // held in their köşk stays open to them, drafts and live links included.
    // A köşk with a nazımı is never the passive scope itself.
    const koskNazim = heldRoles.some(
      (r) =>
        r.role === ASSIGNED_ROLES.KOSK_NAZIM &&
        r.scope.type === SCOPE_TYPES.KOSK &&
        !sameScope(r.scope, passive)
    );
    if (management || koskNazim) {
      // Opening is the whole point of the permission: the Medaris nazımı who
      // holds it reads the content even though no role of theirs reaches it
      // (nizam/14: "yalnız Medaris başnazımı ve izni olan Medaris nazımları
      // açabilir, her açış denetim kaydına yazılır"). The köşk nazımı's role
      // already reaches it; their open is on the record all the same.
      openedPassive = passive;
      if (management) {
        codes.add(PERMISSIONS.COURSE_VIEW_DETAILS);
        codes.add(PERMISSIONS.COURSE_STAFF_READ);
      }
    } else {
      for (const code of [...codes]) {
        if (PERMISSION_META[code].content) codes.delete(code);
      }
    }
  }

  return {
    codes,
    openedPassive,
    grantAuthorities: grantedBy,
    grantHoldings: holdings,
  };
}

/**
 * The roles that confer a permission, not only whether it is held (MDRS-205).
 *
 * Each role the caller holds is taken alone, with the grants that sit under it,
 * and kept when that alone holds one of `wanted` on the resource. A caller who
 * is a medrese nazırı (no defaults) and also a müderris of one of its courses
 * holds `ban.course` there through the müderris role, and only that role confers
 * it: the nazırı does not. A kademe that orders people by the role they hold
 * (the ban ladder: who may lift whose ban) needs exactly this, so that a role
 * with no power of its own never raises the standing of one that has.
 */
export function rolesConferring(
  facts: IAuthzFacts,
  roles: readonly IHeldRole[],
  grants: readonly IHeldGrantCodes[],
  wanted: readonly PermissionCode[],
  now: Date = new Date()
): AssignedRole[] {
  const conferring = new Set<AssignedRole>();
  for (const held of roles) {
    if (conferring.has(held.role)) continue;
    const { codes } = effectivePermissions(facts, [held], grants, now);
    if (wanted.some((code) => codes.has(code))) conferring.add(held.role);
  }
  return [...conferring];
}
