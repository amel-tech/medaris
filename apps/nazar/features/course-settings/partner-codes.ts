/**
 * "Ortak uygulama kodları" of Ders ayarları as rules (partner enrollments): a
 * partner application's codes for this course, each of which enrols the
 * people its registrations name. Pure, like `./course-settings`, so the card
 * has nothing to decide.
 */

/** tedrisat's shape of a code: lower-case letters, digits and hyphens, at most 64. */
export const PARTNER_CODE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const PARTNER_CODE_MAX = 64;

/**
 * What the field holds as a code: trimmed and lower-cased, as people paste
 * codes from the partner's panel. `toLowerCase`, not `toLocaleLowerCase("tr")`:
 * a code is ASCII, and the Turkish rule would turn `I` into `ı`.
 */
export const normalizePartnerCode = (typed: string): string =>
  typed.trim().toLowerCase();

/** Why the typed code cannot be sent, or null; checked before it is. */
export function partnerCodeProblem(code: string): "empty" | "shape" | null {
  if (!code) return "empty";
  return PARTNER_CODE_PATTERN.test(code) ? null : "shape";
}

/**
 * The section is drawn only when the server works with at least one partner
 * application and the caller holds `course.partner_codes`: the köşk nazımı
 * and the başnazım, not the müderris.
 */
export const showsPartnerCodes = (
  partnerCount: number,
  holdsPartnerCodes: boolean
): boolean => partnerCount > 0 && holdsPartnerCodes;

/** The message key (from the catalogue's root) of a refused write, from the API's code. */
export function partnerCodeErrorKey(code: string): string {
  switch (code) {
    case "PARTNER_CODE_TAKEN":
      return "CourseSettings.partnerCodes.errors.taken";
    case "VALIDATION_ERROR":
      return "CourseSettings.partnerCodes.errors.shape";
    case "PARTNER_UNKNOWN":
      return "CourseSettings.partnerCodes.errors.unknownPartner";
    case "AUTHZ_FORBIDDEN":
      return "Problems.actionForbidden";
    default:
      return "CourseSettings.errors.generic";
  }
}
