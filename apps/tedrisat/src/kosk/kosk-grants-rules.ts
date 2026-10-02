import {
  COURSE_CATALOG,
  COURSE_CODES,
  PERMISSIONS,
} from "../assignment/permission-catalog";

/**
 * What a giver may hand to a ders nazırı (MDRS-172, nizam/38): "Verdiğiniz
 * izin, kendi izinlerinizi aşamaz." The köşk nazımı's own permissions are what
 * they hold in the köşk, and `course.manage_all` is the one that covers the
 * work in every course of it — so it opens the whole course catalog, and
 * without it nothing can be handed on. Pure, so the rule is pinned without a
 * database.
 */
export function grantableCourseCodes(
  heldInKosk: readonly string[]
): readonly string[] {
  return heldInKosk.includes(PERMISSIONS.COURSE_MANAGE_ALL)
    ? COURSE_CATALOG
    : [];
}

export interface IRequestedCodes {
  /** Codes outside the course catalog: no such permission in this scope. */
  unknown: string[];
  /** Codes in the catalog that the giver does not hold. */
  beyondGiver: string[];
  /** The de-duplicated codes asked for, in the order asked. */
  codes: string[];
}

export function checkRequestedCodes(
  requested: readonly string[],
  grantable: readonly string[]
): IRequestedCodes {
  const codes = [...new Set(requested)];
  const allowed = new Set(grantable);
  return {
    codes,
    unknown: codes.filter((c) => !COURSE_CODES.has(c)),
    beyondGiver: codes.filter((c) => COURSE_CODES.has(c) && !allowed.has(c)),
  };
}
