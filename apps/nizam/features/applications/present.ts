import type { PendingEnrollmentResponse } from "@medaris/services/tedrisat";

/**
 * Pure helpers behind the applications screens (nizam 31 and 57, MDRS-168):
 * the filter, the count, the row sentences and which refusal says what. No
 * React and no I/O, so what the designs show can be pinned by plain specs.
 */
export type Messages = (
  key: string,
  values?: Record<string, string | number>
) => string;

/** One waiting application, with the course's own words beside it. */
export interface ApplicationRow {
  userId: string;
  courseId: string;
  name: string;
  email: string | null;
  courseTitle: string;
  /** the course's müderris, first to last; may be empty */
  muderris: string[];
  /** ISO time */
  createdAt: string;
}

/** The row the page draws for one `PendingEnrollmentResponse`. */
export function toRow(
  pending: PendingEnrollmentResponse,
  muderris: string[],
  unnamed: string
): ApplicationRow {
  return {
    userId: pending.userId,
    courseId: pending.courseId,
    name: pending.studentName?.trim() || unnamed,
    email: pending.studentEmail ?? null,
    courseTitle: pending.courseTitle,
    muderris,
    createdAt: new Date(pending.createdAt).toISOString(),
  };
}

/** Text compared the way a person types it: case- and diacritic-insensitive, in Turkish. */
const fold = (text: string) =>
  text
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ı/g, "i");

/**
 * The rows for the chosen course (`"all"` keeps every one) and the words in
 * the search box, which match the talebe's name or e-mail.
 */
export function filterApplications(
  rows: ApplicationRow[],
  courseId: string,
  query: string
): ApplicationRow[] {
  const q = fold(query.trim());
  return rows.filter(
    (row) =>
      (courseId === "all" || row.courseId === courseId) &&
      (q === "" || fold(`${row.name} ${row.email ?? ""}`).includes(q))
  );
}

/** The courses the filter offers: those that have a waiting application, in the order they first appear. */
export function courseChoices(
  rows: ApplicationRow[]
): { id: string; title: string }[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    if (!seen.has(row.courseId)) seen.set(row.courseId, row.courseTitle);
  }
  return [...seen].map(([id, title]) => ({ id, title }));
}

/** Newest first, or oldest first. */
export function sortByDate(
  rows: ApplicationRow[],
  direction: "ascending" | "descending"
): ApplicationRow[] {
  const sign = direction === "descending" ? -1 : 1;
  return [...rows].sort(
    (a, b) => sign * (Date.parse(a.createdAt) - Date.parse(b.createdAt))
  );
}

/** A row's key: the same talebe may wait on two courses. */
export const rowKey = (row: Pick<ApplicationRow, "courseId" | "userId">) =>
  `${row.courseId}:${row.userId}`;

/** The accessible name of a row's button: "Onayla: Rümeysa Nur Karaca, Bina ve İzhar Şerhi". */
export function actionLabel(
  kind: "approve" | "reject",
  row: Pick<ApplicationRow, "name" | "courseTitle">,
  t: Messages
): string {
  return t(`${kind}Label`, { name: row.name, course: row.courseTitle });
}

/** The key of the sentence for a refused or failed decision; tedrisat's body carries the status. */
export function decisionErrorKey(
  errorBody: unknown
): "errorForbidden" | "errorGone" | "errorUnknown" {
  const body =
    errorBody && typeof errorBody === "object"
      ? (errorBody as { code?: unknown; statusCode?: unknown })
      : {};
  // tedrisat's own codes win over the HTTP status Nest adds beside them
  if (body.code === "AUTHZ_FORBIDDEN") return "errorForbidden";
  if (
    body.code === "ENROLLMENT_NOT_FOUND" ||
    body.code === "ENROLLMENT_STATE_CONFLICT"
  ) {
    return "errorGone";
  }
  const status = Number(body.statusCode);
  if (status === 403) return "errorForbidden";
  // the application is gone (someone else decided) or no longer pending
  if (status === 404 || status === 409) return "errorGone";
  return "errorUnknown";
}
