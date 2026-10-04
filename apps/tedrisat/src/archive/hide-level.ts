import {
  type AuthenticatedUser,
  type AuthzService,
  type PermissionCode,
  type ResourceRef,
} from "@medaris/common";
import { BAN_TIERS, type BanTier } from "../ban/ban-tier";
import {
  SCOPE_TYPES,
  type ScopeType,
} from "../database/schema/scope-type.schema";
import type { ArchiveItemType } from "./archive-types";

/**
 * The kademe of a hide (MDRS-135; owner, d-1003-07: "Elbette kademe var").
 *
 * Whatever two authorities can hide, the same rule as the bans: it is brought
 * back by the level that hid it, or any level above it. A hide records the level
 * its hider acted at (`archived_level`), and a restore by a lower level is
 * refused with `ArchiveRestoreLevelError`.
 *
 * The ladder is the ban ladder, `BAN_TIERS`: course < medrese < köşk < platform.
 * It is one table (`HIDE_RANK`) so that changing which level is above which
 * changes it everywhere.
 */
export type HideLevel = ScopeType;

export const HIDE_RANK: Record<HideLevel, BanTier> = {
  [SCOPE_TYPES.COURSE]: BAN_TIERS.COURSE,
  [SCOPE_TYPES.MADRASAH]: BAN_TIERS.MADRASAH,
  [SCOPE_TYPES.KOSK]: BAN_TIERS.KOSK,
  [SCOPE_TYPES.PLATFORM]: BAN_TIERS.PLATFORM,
};

/** The levels, lowest first: the order `HIDE_RANK` gives them. */
export const HIDE_LEVELS: readonly HideLevel[] = [
  SCOPE_TYPES.COURSE,
  SCOPE_TYPES.MADRASAH,
  SCOPE_TYPES.KOSK,
  SCOPE_TYPES.PLATFORM,
];

/** A restore by `restorer` is allowed when it is at, or above, the level that hid. */
export const mayRestoreAt = (restorer: HideLevel, hider: HideLevel): boolean =>
  HIDE_RANK[restorer] >= HIDE_RANK[hider];

/**
 * The lowest level that could have hidden an item: what a row hidden before the
 * level was recorded counts as. A course of a medrese could be hidden by the
 * medrese; a köşk's own course only by the köşk; a week or a session by whoever
 * runs the course; a köşk, a deck and a medrese by their own level.
 */
export function lowestHidingLevel(item: {
  type: ArchiveItemType;
  madrasahId: string | null;
}): HideLevel {
  switch (item.type) {
    case "madrasah":
      return SCOPE_TYPES.MADRASAH;
    case "course":
      return item.madrasahId ? SCOPE_TYPES.MADRASAH : SCOPE_TYPES.KOSK;
    case "week":
    case "session":
    case "recording":
      return SCOPE_TYPES.COURSE;
    default:
      return SCOPE_TYPES.KOSK;
  }
}

/** The level an item was hidden at: the recorded one, or the lowest that could have. */
export const hiderLevelOf = (item: {
  type: ArchiveItemType;
  madrasahId: string | null;
  archivedLevel: HideLevel | null;
}): HideLevel => item.archivedLevel ?? lowestHidingLevel(item);

/** One rung of the ladder: holding any of these codes on the resource is acting at that level. */
export interface IHideStep {
  level: HideLevel;
  codes: readonly PermissionCode[];
}

/**
 * The level a caller acts at on a resource: the Medaris başnazım (SYSTEM_ADMIN)
 * is the platform; otherwise the highest rung whose codes they hold, whatever
 * else they hold (someone who is both a köşk nazımı and a başmüderris acts, and
 * so hides, as the köşk, since that is the stronger hand); `fallback` when none
 * of them is held. The engine decides, with no audit row: this is a question
 * about the caller, not a read.
 */
export async function actingLevel(
  authz: AuthzService,
  user: AuthenticatedUser,
  resource: ResourceRef,
  ladder: readonly IHideStep[],
  fallback: HideLevel
): Promise<HideLevel>;
/** With `null` for the fallback, a caller who holds no rung gets `null`: they act at no level. */
export async function actingLevel(
  authz: AuthzService,
  user: AuthenticatedUser,
  resource: ResourceRef,
  ladder: readonly IHideStep[],
  fallback: null
): Promise<HideLevel | null>;
export async function actingLevel(
  authz: AuthzService,
  user: AuthenticatedUser,
  resource: ResourceRef,
  ladder: readonly IHideStep[],
  fallback: HideLevel | null
): Promise<HideLevel | null> {
  if (authz.isSystemAdmin(user)) return SCOPE_TYPES.PLATFORM;
  const held = (await authz.effective(user, resource))?.codes;
  const steps = [...ladder].sort(
    (a, b) => HIDE_RANK[b.level] - HIDE_RANK[a.level]
  );
  return (
    steps.find((step) => step.codes.some((code) => held?.has(code)))?.level ??
    fallback
  );
}

/**
 * Whether the caller may bring back something hidden at `hiddenAt`: they hold a
 * rung of the ladder on the resource and act at that level or above. The
 * question the screens ask to draw "Geri al"; the restore itself asks it again.
 */
export async function mayRestoreHidden(
  authz: AuthzService,
  user: AuthenticatedUser,
  resource: ResourceRef,
  ladder: readonly IHideStep[],
  hiddenAt: HideLevel
): Promise<boolean> {
  const level = await actingLevel(authz, user, resource, ladder, null);
  return level !== null && mayRestoreAt(level, hiddenAt);
}
