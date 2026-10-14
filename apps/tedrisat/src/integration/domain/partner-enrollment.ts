/**
 * Partner enrollments: a partner application whose registrations become
 * Medaris course enrollments. It calls `/integrations/*` with a token from its
 * own client's service account; course staff map its codes to courses in
 * nazar's course settings. The rules that need no database live here.
 */

/** The realm role a partner client's service account carries; a token without it is refused. */
export const PARTNER_ENROLLMENT_ROLE = "partner-enrollment";

/** The partner's own code for a course or a weekly activity. */
export const COURSE_CODE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** The partner's registration id; one registration may cover several courses. */
export const REGISTRATION_REF_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** The audit row of a seat a partner's registration added (or gave back). */
export const PARTNER_ENROLL_ACTION = "enrollment.partner_add";
/** The audit rows of the staff mapping a code to a course, and taking it off. */
export const PARTNER_CODE_ADD_ACTION = "course.partner_code_add";
export const PARTNER_CODE_REMOVE_ACTION = "course.partner_code_remove";

/**
 * The reason a removal through the course team's path records, which the
 * talebe reads in their notification and the team on "Erişimi kaldırılanlar".
 * Turkish, as the reasons the team types are.
 */
export const partnerRemovalReason = (partnerName: string): string =>
  `${partnerName} üzerinden yapılan kayıt iptal edildi.`;

/** What `PUT /integrations/enrollments/…` answers when it succeeds. */
export type PartnerEnrollStatus = "ENROLLED" | "ALREADY_ENROLLED";

/** What `DELETE /integrations/enrollments/…` answers; it always succeeds. */
export type PartnerUnenrollStatus = "REMOVED" | "KEPT" | "NOT_FOUND";

/**
 * Why tedrisat refused to seat the person (`PARTNER_ENROLLMENT_REFUSED`,
 * `context.reason`): a ban, a seat the course team took away, a course no
 * talebe could enrol in now, or a request that moved while this one ran.
 */
export type PartnerRefusalReason =
  | "BANNED"
  | "REMOVED_BY_COURSE_TEAM"
  | "CHANGED"
  | "COURSE_NOT_FOUND"
  | "COURSE_NOT_PUBLISHED"
  | "COURSE_HIDDEN"
  | "KOSK_HIDDEN";
