import {
  ASSIGNED_ROLES,
  type AssignedRole,
  SCOPE_TYPES,
  type ScopeType,
} from "../database/schema/role-assignment.schema";

/**
 * The kademe rule of bans (MDRS-177, screen nizam/42): a ban is lifted only by
 * the kademe that placed it or a higher one.
 *
 * The ladder, lowest first, is the one the designs show: whoever teaches a
 * course (müderris, ders nazırı), whoever runs a medrese (nazır, başmüderris),
 * the köşk nazımı, and the Medaris administration (Medaris nazımı and the
 * başnazım, the SYSTEM_ADMIN realm role). A medrese nazır's ban can therefore
 * be lifted by the köşk nazımı of the köşk it sits in, and a Medaris nazımı's
 * only by Medaris administration — "Bu yasağı yalnız Medaris yönetimi
 * kaldırabilir."
 */
export const BAN_TIERS = {
  COURSE: 1,
  MADRASAH: 2,
  KOSK: 3,
  PLATFORM: 4,
} as const;
export type BanTier = (typeof BAN_TIERS)[keyof typeof BAN_TIERS];

/** What a ban records as the role it was placed in, beyond the six assigned roles. */
export const SYSTEM_ADMIN_ROLE = "SYSTEM_ADMIN";
export type BanRole = AssignedRole | typeof SYSTEM_ADMIN_ROLE;

const TIER_OF_ROLE: Record<BanRole, BanTier> = {
  [ASSIGNED_ROLES.MUDERRIS]: BAN_TIERS.COURSE,
  [ASSIGNED_ROLES.DERS_NAZIR]: BAN_TIERS.COURSE,
  [ASSIGNED_ROLES.MEDRESE_NAZIR]: BAN_TIERS.MADRASAH,
  [ASSIGNED_ROLES.MEDRESE_BASMUDERRIS]: BAN_TIERS.MADRASAH,
  [ASSIGNED_ROLES.KOSK_NAZIM]: BAN_TIERS.KOSK,
  [ASSIGNED_ROLES.MEDARIS_NAZIM]: BAN_TIERS.PLATFORM,
  [SYSTEM_ADMIN_ROLE]: BAN_TIERS.PLATFORM,
};

export const tierOfRole = (role: BanRole): BanTier => TIER_OF_ROLE[role];

/** A role held at some scope, as the ban service finds it. */
export interface IHeldBanRole {
  role: BanRole;
}

/** The highest-ranked role of those held, or null when none counts. */
export function highestRole(held: readonly IHeldBanRole[]): BanRole | null {
  let best: BanRole | null = null;
  for (const { role } of held) {
    if (best === null || tierOfRole(role) > tierOfRole(best)) best = role;
  }
  return best;
}

/**
 * Who may place a ban: the kademe the stored roles carry grants it to the
 * course's teachers, the köşk nazımı and above. A medrese's nazır does not
 * moderate a köşk's course (MDRS-133); bans from the medrese side belong to
 * the nazır screens.
 */
export const MAY_BAN_ROLES: readonly BanRole[] = [
  ASSIGNED_ROLES.MUDERRIS,
  ASSIGNED_ROLES.DERS_NAZIR,
  ASSIGNED_ROLES.KOSK_NAZIM,
  ASSIGNED_ROLES.MEDARIS_NAZIM,
  SYSTEM_ADMIN_ROLE,
];

/**
 * Who may act on a ban in a medrese's course or over the medrese (MDRS-187,
 * nazir/11): lift it, widen it to the medrese, ask for it to be permanent. The
 * roles that ban, and the medrese's own. A medrese role counts only where the
 * ban's course belongs to that medrese, which the scopes it is looked up in
 * decide.
 */
export const MAY_MODERATE_ROLES: readonly BanRole[] = [
  ...MAY_BAN_ROLES,
  ASSIGNED_ROLES.MEDRESE_NAZIR,
  ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
];

/** Banning a whole köşk is the köşk nazımı's and above. */
export const mayBanKosk = (tier: BanTier): boolean => tier >= BAN_TIERS.KOSK;

/**
 * Who may act for the medrese as a whole (MDRS-187): bar a talebe from all of
 * it, widen a course ban to it, ask for a ban to be permanent. Its own nazırs
 * and Medaris administration; a köşk's nazım rules the köşk, not the medrese,
 * and a course's müderris only the course.
 */
export const MADRASAH_WIDE_ROLES: readonly BanRole[] = [
  ASSIGNED_ROLES.MEDRESE_NAZIR,
  ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
  ASSIGNED_ROLES.MEDARIS_NAZIM,
  SYSTEM_ADMIN_ROLE,
];

/** The kademe rule: the lifter's tier reaches the banner's. */
export const mayLift = (lifterTier: BanTier, bannedTier: number): boolean =>
  lifterTier >= bannedTier;

/** A role the caller holds, and where. */
export interface IHeldAssignment {
  role: AssignedRole;
  scopeType: ScopeType;
  scopeId: string | null;
}

/** Where a ban sits, for finding the roles that bear on it. */
export interface IBanScopes {
  koskId: string | null;
  courseId: string | null;
  madrasahId: string | null;
}

/**
 * The highest-ranked of the `allowed` roles among those held that bear on the
 * scopes: platform-wide, or held in the köşk, the course or the medrese. The
 * same rule as `BanRepository.rolesHeld`, over assignments already read, for a
 * list that needs the answer for each of its rows.
 */
export function standingAmong(
  held: readonly IHeldAssignment[],
  scopes: IBanScopes,
  allowed: readonly BanRole[]
): BanRole | null {
  const bears = (h: IHeldAssignment) =>
    h.scopeType === SCOPE_TYPES.PLATFORM ||
    (h.scopeType === SCOPE_TYPES.KOSK && h.scopeId === scopes.koskId) ||
    (h.scopeType === SCOPE_TYPES.COURSE && h.scopeId === scopes.courseId) ||
    (h.scopeType === SCOPE_TYPES.MADRASAH && h.scopeId === scopes.madrasahId);
  return highestRole(held.filter((h) => allowed.includes(h.role) && bears(h)));
}
