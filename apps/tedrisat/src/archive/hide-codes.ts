import { PERMISSIONS, type PermissionCode } from "@medaris/common";

const P = PERMISSIONS;

/**
 * Who reads an Arşiv (MDRS-143). Who hides and restores is the ladders of
 * `hide-level.ts`; reading an archive is a route's `@Authz`, and these are the
 * codes it asks: whoever may hide in the place, or bring something back there.
 */

/** Reading a köşk's archive: whoever may hide and bring back in it. */
export const KOSK_ARCHIVE_READ_CODES: readonly PermissionCode[] = [
  P.KOSK_MANAGE,
  P.PLATFORM_KOSK_EDIT,
];

/**
 * Reading a medrese's archive: everyone who may hide in it or bring something
 * back, and `madrasah.settings_edit`, which opened it before and is not narrowed.
 */
export const MADRASAH_ARCHIVE_READ_CODES: readonly PermissionCode[] = [
  P.MADRASAH_COURSE_HIDE,
  P.MADRASAH_HIDE,
  P.PLATFORM_MADRASAH_EDIT,
  P.MADRASAH_SETTINGS_EDIT,
];

/** Reading one course's archive and hiding its weeks: the course team's `week.hide`. */
export const COURSE_ARCHIVE_READ_CODES: readonly PermissionCode[] = [
  P.WEEK_HIDE,
];
