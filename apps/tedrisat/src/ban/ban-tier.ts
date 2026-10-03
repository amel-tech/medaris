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

/** Banning a whole köşk is the köşk nazımı's and above. */
export const mayBanKosk = (tier: BanTier): boolean => tier >= BAN_TIERS.KOSK;

/** The kademe rule: the lifter's tier reaches the banner's. */
export const mayLift = (lifterTier: BanTier, bannedTier: number): boolean =>
  lifterTier >= bannedTier;
