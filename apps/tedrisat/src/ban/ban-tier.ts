import {
  ASSIGNED_ROLES,
  type AssignedRole,
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
 *
 * Since MDRS-205 the ladder only ORDERS people. Whether someone may ban, lift,
 * widen, ask for a permanent ban or read the lists is the catalogue's
 * (`ban-codes.ts`, decided by `BanAuthority`); the tier is then the rank of the
 * highest role that confers the permission they used.
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
 * Who runs a course, and so cannot be barred from it (MDRS-177). This is not a
 * permission to ban, which the catalogue decides: it is who the people are that
 * a ban may not be placed on, whatever they hold, so it stays a list of roles.
 */
export const RUNS_COURSE_ROLES: readonly BanRole[] = [
  ASSIGNED_ROLES.MUDERRIS,
  ASSIGNED_ROLES.DERS_NAZIR,
  ASSIGNED_ROLES.KOSK_NAZIM,
  ASSIGNED_ROLES.MEDARIS_NAZIM,
  SYSTEM_ADMIN_ROLE,
];

/**
 * Who runs a medrese or a course of one, and cannot be barred from it (MDRS-187):
 * the people above, and the medrese's own başmüderris and nazır. A medrese
 * course has the same protection on every route that bans in it, whether the
 * ban is placed from the course or from the medrese.
 */
export const RUNS_MADRASAH_ROLES: readonly BanRole[] = [
  ...RUNS_COURSE_ROLES,
  ASSIGNED_ROLES.MEDRESE_NAZIR,
  ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
];

/** The kademe rule: the lifter's tier reaches the banner's. */
export const mayLift = (lifterTier: BanTier, bannedTier: number): boolean =>
  lifterTier >= bannedTier;

/** Where a ban sits, for finding the roles that bear on it. */
export interface IBanScopes {
  koskId: string | null;
  courseId: string | null;
  madrasahId: string | null;
}
