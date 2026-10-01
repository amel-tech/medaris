import type {
  EnrollmentResponse,
  MeResponse,
  UserSummaryResponse,
} from "@medaris/services/tedrisat";

/**
 * Who may change a course's müderris list (MDRS-105): the matrix gives
 * `assign_muderris` to the köşk manager only, and SYSTEM_ADMIN bypasses it.
 * Read from `GET /me`'s roles, which is all today's model offers; role model
 * v2 replaces this with the effective permissions `GET /me` will return
 * (MDRS-142). tedrisat checks it again on save, so this only decides what the
 * editor offers.
 */
export const mayAssignMuderris = (
  me: Pick<MeResponse, "roles"> | null,
  koskId: string
): boolean =>
  Boolean(
    me &&
      (me.roles.systemAdmin || me.roles.manages.some((k) => k.id === koskId))
  );

/** The name a picked account is listed under; the address when it has none. */
export const userDisplayName = (
  user: Pick<UserSummaryResponse, "givenName" | "familyName" | "email">
): string =>
  [user.givenName, user.familyName]
    .filter((part): part is string => Boolean(part?.trim()))
    .map((part) => part.trim())
    .join(" ") ||
  user.email ||
  "";

const codeOf = (errorBody: unknown): unknown =>
  typeof errorBody === "object" && errorBody !== null
    ? (errorBody as { code?: unknown }).code
    : undefined;

/** `nizam.CourseTeam.*` keys for the API's müderris and enrollment refusals. */
const ERROR_KEYS = {
  MUDERRIS_ASSIGNMENT_FORBIDDEN: "CourseTeam.errorAssignmentForbidden",
  MUDERRIS_UNKNOWN_USER: "CourseTeam.errorUnknownUser",
  MUDERRIS_DUPLICATE_USER: "CourseTeam.errorDuplicateUser",
  USER_LOOKUP_FORBIDDEN: "CourseTeam.errorLookupForbidden",
  ENROLLMENT_STATE_CONFLICT: "CourseTeam.errorEnrollmentState",
  ENROLLMENT_NOT_FOUND: "CourseTeam.errorEnrollmentNotFound",
  AUTHZ_FORBIDDEN: "CourseTeam.errorForbidden",
} as const;
export type CourseTeamErrorKey = (typeof ERROR_KEYS)[keyof typeof ERROR_KEYS];

/** The translation key for a refusal, or null to show the API's own message. */
export const courseTeamErrorKey = (
  errorBody: unknown
): CourseTeamErrorKey | null => {
  const code = codeOf(errorBody);
  return typeof code === "string" && Object.hasOwn(ERROR_KEYS, code)
    ? ERROR_KEYS[code as keyof typeof ERROR_KEYS]
    : null;
};

/** The actions the roster offers for one enrollment, in display order. */
export type RosterAction =
  | "approve"
  | "reject"
  | "complete"
  | "reopen"
  | "remove";

export const rosterActions = (
  status: EnrollmentResponse["status"]
): RosterAction[] => {
  switch (status) {
    case "PENDING":
      return ["approve", "reject"];
    case "ENROLLED":
      return ["complete", "remove"];
    case "COMPLETED":
      return ["reopen"];
    default:
      return [];
  }
};
