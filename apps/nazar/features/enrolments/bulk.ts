import type { BulkEnrollmentResponse } from "@medaris/services/tedrisat";

/**
 * "Toplu talebe ekle" (owner, 2026-10-12) as rules: how the typed list is read,
 * how many addresses one request takes, how the API's answer is told line by
 * line, and which sentence a refusal or a skipped address gets. Pure, so the
 * dialog has nothing to decide. The API reads the list the same way and is
 * the one that says which entries are not addresses.
 */

/** At most this many addresses in one request, as tedrisat takes them. */
export const BULK_MAX = 500;

/**
 * The addresses in the text: one a line, or separated by commas or
 * semicolons; each trimmed and lower-cased, empty entries dropped, each kept
 * once in the order first typed.
 */
export function parseEmailList(text: string): string[] {
  const found = new Set<string>();
  for (const part of text.split(/[\r\n,;]+/)) {
    const email = part.trim().toLowerCase();
    if (email) found.add(email);
  }
  return [...found];
}

/** The outcomes the result names, in the order it names them. */
export const OUTCOMES = [
  "enrolled",
  "approved",
  "already",
  "notFound",
  "invalid",
  "skipped",
] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** One line of the result: an outcome and how many it holds; an outcome with none has no line. */
export const outcomeLines = (
  result: BulkEnrollmentResponse
): { outcome: Outcome; count: number }[] =>
  OUTCOMES.map((outcome) => ({
    outcome,
    count: result[outcome].length,
  })).filter((line) => line.count > 0);

/** The addresses no account was found for, then the ones that are not addresses: the list to copy. */
export const unmatched = (result: BulkEnrollmentResponse): string[] => [
  ...result.notFound,
  ...result.invalid,
];

/** The message key (under `CourseStudents.bulk.reasons`) of why an address was skipped. */
export function skipReasonKey(reason: string): string {
  switch (reason) {
    case "barred":
    case "revoked":
    case "changed":
      return reason;
    case "COMPLETED":
      return "completed";
    default:
      return "other";
  }
}

/** The message key (from the catalogue's root) of a refused bulk add, from the code the API answered with. */
export function bulkErrorKey(code: string): string {
  switch (code) {
    case "AUTHZ_FORBIDDEN":
      return "Problems.actionForbidden";
    case "COURSE_NOT_FOUND":
      return "CourseStudents.bulk.errors.closed";
    case "KEYCLOAK_ADMIN_NOT_CONFIGURED":
    case "KEYCLOAK_ADMIN_UNAVAILABLE":
      return "CourseStudents.bulk.errors.directory";
    default:
      return "Problems.actionGeneric";
  }
}
