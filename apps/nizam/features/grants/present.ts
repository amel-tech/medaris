import type {
  KoskGrantCourseResponse,
  KoskGrantResponse,
} from "@medaris/services/tedrisat";

/**
 * Pure helpers behind the köşk's İzinler page (nizam 38, MDRS-172): which
 * courses a ders nazırı can be made in, how a person's permissions are summed
 * up ("8 izin" and the names under it), the refusals' sentences. No React and
 * no I/O, so the sentences and rules the design shows can be pinned by plain
 * specs.
 */
export type Messages = (
  key: string,
  values?: Record<string, string | number>
) => string;

/** `course.edit` is the message key `course_edit`: a dot would nest. */
export const courseCodeKey = (code: string): string => code.replace(/\./g, "_");

/**
 * The courses a post can be made in: the köşk's own, not a medrese's work. The
 * generated client turns a null `madrasahName` into undefined, so "no medrese"
 * is "no name", not `=== null`.
 */
export function freeCourses(
  courses: readonly KoskGrantCourseResponse[]
): KoskGrantCourseResponse[] {
  return courses.filter((c) => !c.madrasahName);
}

/** The medrese courses the page's note names: "Bina ve İzhar Şerhi ile Maksûd şerhi". */
export function madrasahCourseNote(
  courses: readonly KoskGrantCourseResponse[]
): { titles: string[]; madrasahs: string[] } {
  const owned = courses.filter((c) => Boolean(c.madrasahName));
  return {
    titles: owned.map((c) => c.title),
    madrasahs: [...new Set(owned.map((c) => c.madrasahName as string))],
  };
}

/** The codes in the order the dialog draws them (the API's `grantable` order). */
export function orderCodes(
  codes: readonly string[],
  order: readonly string[]
): string[] {
  const rank = new Map(order.map((c, i) => [c, i]));
  return [...new Set(codes)].sort(
    (a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999)
  );
}

/**
 * "8 izin" and the names that follow: the count is the first line of the
 * İzinler column, the sentence list the second.
 */
export function permissionSummary(
  codes: readonly string[],
  order: readonly string[],
  nameOf: (code: string) => string
): { count: number; names: string } {
  const sorted = orderCodes(codes, order);
  return { count: sorted.length, names: sorted.map(nameOf).join(", ") };
}

/** The permissions of a post as a list of codes, nothing else of it. */
export const codesOf = (grant: Pick<KoskGrantResponse, "permissions">) =>
  grant.permissions;

/** Save is allowed once there is a person (or a post being edited), a course and at least one permission. */
export function canSaveGrant(input: {
  editing: boolean;
  personChosen: boolean;
  courseChosen: boolean;
  permissionCount: number;
  endProblem: string | null;
}): boolean {
  return (
    (input.editing || (input.personChosen && input.courseChosen)) &&
    input.permissionCount > 0 &&
    input.endProblem === null
  );
}

const KNOWN: Record<string, string> = {
  GRANT_EXCEEDS_GIVER: "errors.exceeds",
  PERMISSION_UNKNOWN: "errors.unknownPermission",
  GRANT_COURSE_INVALID: "errors.courseInvalid",
  COURSE_NAZIR_EXISTS: "errors.exists",
  COURSE_NAZIR_NOT_FOUND: "errors.notFound",
  GRANT_EXPIRY_INVALID: "errors.expiryInvalid",
  KOSK_NAZIM_UNKNOWN_ACCOUNT: "errors.unknownAccount",
  AUTHZ_FORBIDDEN: "errors.forbidden",
};

/** The `nizam.KoskGrantsPage` key for a refusal's code, or the generic one. */
export function grantErrorKey(errorBody: unknown): string {
  const code =
    errorBody && typeof errorBody === "object" && "code" in errorBody
      ? String((errorBody as { code: unknown }).code)
      : "";
  return KNOWN[code] ?? "errors.generic";
}
