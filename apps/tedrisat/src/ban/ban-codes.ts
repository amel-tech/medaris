import { PERMISSIONS, type PermissionCode } from "@medaris/common";
import { BAN_SCOPES, type BanScope } from "../database/schema/ban.schema";

const P = PERMISSIONS;

/**
 * What each ban action asks of the catalogue (MDRS-205), in one table.
 *
 * The owner's rules, as they land here:
 *
 * - **The permission to ban at a level also lifts bans at that level.**
 *   `ban.course`, `ban.manage_kosk`, `madrasah.ban` and `platform.ban_scoped`
 *   both impose and lift. The kademe (`ban-tier.ts`) only orders WHO may lift
 *   WHOM: the level that placed the ban, or any level above it.
 * - **A başmüderris may ban in its medrese's courses**: it holds `ban.course`
 *   there by role default.
 * - **A Medaris nazımı holding only `platform.ban_scoped` may not impose or
 *   lift a course ban**, though it may at the köşk's and the medrese's level;
 *   the başnazım (SYSTEM_ADMIN, who bypasses all of this) may. "Başnazım zaten
 *   atabilir ban ama medaris nazımı atamaz": a course ban belongs to the
 *   course-level authorities and those above them, which is why no platform
 *   code is in the course row.
 * - **`madrasah.ban` reaches the medrese's courses** (owner, d-1004-06,
 *   "kapsar"): a medrese nazırı holding it may place and lift a ban on a single
 *   course of its own medrese, not only the medrese-wide ban. It is in the
 *   course row, and since it is held only where the medrese is on the chain it
 *   reaches no other medrese's course and no course the köşk keeps for itself;
 *   its tier in the kademe is the medrese's.
 *
 * `ban.lift_course` stays a way to lift a course ban without being able to
 * place one; every role that holds it by default holds `ban.course` too.
 * `ban.manage_kosk` is "ders ve köşk düzeyinde yasakla ya da yasağı kaldır", so
 * it is in the course row as well. `platform.ban_account` is the platform's own
 * scope (the account closes, MDRS-197) and bans nothing yet; it reads.
 */

/** Placing a ban at a level: the permission, held where the ban would sit. */
export const IMPOSE_CODES: Record<BanScope, readonly PermissionCode[]> = {
  [BAN_SCOPES.COURSE]: [P.BAN_COURSE, P.BAN_MANAGE_KOSK, P.MADRASAH_BAN],
  [BAN_SCOPES.KOSK]: [P.BAN_MANAGE_KOSK, P.PLATFORM_BAN_SCOPED],
  [BAN_SCOPES.MADRASAH]: [P.MADRASAH_BAN, P.PLATFORM_BAN_SCOPED],
};

/** Lifting a ban placed at a level: the same permissions, and `ban.lift_course` for a course. */
export const LIFT_CODES: Record<BanScope, readonly PermissionCode[]> = {
  ...IMPOSE_CODES,
  [BAN_SCOPES.COURSE]: [
    P.BAN_COURSE,
    P.BAN_LIFT_COURSE,
    P.BAN_MANAGE_KOSK,
    P.MADRASAH_BAN,
  ],
};

/** Asking Medaris administration to make a ban permanent: the medrese's own permission. */
export const PERMANENT_REQUEST_CODES: readonly PermissionCode[] = [
  P.MADRASAH_PERMANENT_BAN_REQUEST,
];

/** Reading a köşk's bans: those who may act on them, and who may read all of them. */
export const READ_KOSK_BANS_CODES: readonly PermissionCode[] = [
  P.BAN_MANAGE_KOSK,
  P.PLATFORM_BAN_SCOPED,
  P.PLATFORM_BAN_ACCOUNT,
];

/** Reading every ban of every köşk (the Medaris list): the two platform permissions the menu asks for. */
export const READ_ALL_BANS_CODES: readonly PermissionCode[] = [
  P.PLATFORM_BAN_SCOPED,
  P.PLATFORM_BAN_ACCOUNT,
];
