import type {
  HostingCoursesAction,
  HostingOpenCourseResponse,
  HostingRightResponse,
} from "@medaris/services/tedrisat";

/**
 * Pure helpers behind Barındırma hakları and its withdrawal dialog (nizam 26
 * and 27, MDRS-170): the "1 yayında · 1 taslak" line, the talebe total the
 * dialog warns about, who granted and in what role, and the answer a dialog
 * sends. No React and no I/O, so the sentences and counts the designs show
 * can be pinned by plain specs.
 */
export type Messages = (
  key: string,
  values?: Record<string, string | number>
) => string;

type CourseLike = Pick<HostingOpenCourseResponse, "status">;

/**
 * "1 yayında · 1 taslak": how many of the open courses are live and how many
 * are drafts. A part with none is left out; no open course at all is "".
 */
export function openCoursesSummary(courses: CourseLike[], t: Messages): string {
  const published = courses.filter((c) => c.status === "PUBLISHED").length;
  const draft = courses.length - published;
  return [
    published > 0 ? t("published", { count: published }) : null,
    draft > 0 ? t("draft", { count: draft }) : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
}

/** How many talebe the medrese's open courses hold in all. */
export function studentTotal(
  courses: Pick<HostingOpenCourseResponse, "studentCount">[]
): number {
  return courses.reduce((sum, c) => sum + c.studentCount, 0);
}

/** "35 talebe · Mehmet Emin Işıkoğlu, imam" — the second line of a course in the dialog. */
export function courseLine(
  course: Pick<HostingOpenCourseResponse, "studentCount" | "imamName">,
  t: Messages
): string {
  const students =
    course.studentCount > 0
      ? t("students", { count: course.studentCount })
      : t("noStudents");
  return course.imamName
    ? `${students} · ${t("imam", { name: course.imamName })}`
    : students;
}

/** "Medaris başnazımı" or "Köşk nazımı" under the granter's name; "" for a right older than the role was recorded. */
export function granterRole(
  role: HostingRightResponse["grantedBy"]["role"] | undefined,
  t: Messages
): string {
  return role ? t(`roles.${role}`) : "";
}

/** "1 Eylül 2026": the date a right was given, in the viewer's zone. */
export function grantedOn(
  at: Date | string,
  opts: { locale: string; timeZone: string }
): string {
  return new Intl.DateTimeFormat(opts.locale, {
    timeZone: opts.timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(at));
}

/** What a dialog answer is sent as: no open course means nothing to decide, so KEEP. */
export type CoursesChoice = HostingCoursesAction | null;

/** The withdrawal button stays off until there is an answer, when there is a question. */
export function canRevoke(openCourses: number, choice: CoursesChoice): boolean {
  return openCourses === 0 || choice !== null;
}

export function coursesActionFor(
  openCourses: number,
  choice: CoursesChoice
): HostingCoursesAction | null {
  if (openCourses === 0) return "KEEP";
  return choice;
}

const KNOWN: Record<string, string> = {
  HOSTING_RIGHT_NOT_FOUND: "errors.notHeld",
  MADRASAH_NOT_FOUND: "errors.madrasahGone",
  KOSK_NOT_FOUND: "errors.koskGone",
  AUTHZ_FORBIDDEN: "errors.forbidden",
};

/** The `nizam.HostingPage` key for a refusal's code, or the generic one. */
export function hostingErrorKey(errorBody: unknown): string {
  const code =
    errorBody && typeof errorBody === "object" && "code" in errorBody
      ? String((errorBody as { code: unknown }).code)
      : "";
  return KNOWN[code] ?? "errors.generic";
}

/** The medreses a köşk may still be given: not hidden, not already holding the right. */
export function grantable<T extends { id: string }>(
  all: T[],
  held: { madrasahId: string }[]
): T[] {
  const taken = new Set(held.map((h) => h.madrasahId));
  return all.filter((m) => !taken.has(m.id));
}

/**
 * "Nûruosmaniye Köşkü’nde": a Turkish köşk name takes its locative by how it
 * ends, so "{kosk} köşkünde" cannot be one fixed string (that read "Nûruosmaniye
 * Köşkü köşkünün"). A name that does not end in "Köşkü" or "Köşk" gets
 * "… köşkünde". Other languages get the bare name; their own messages carry
 * the preposition.
 */
export function koskLocative(name: string, locale: string): string {
  if (!locale.toLowerCase().startsWith("tr")) return name;
  if (/köşkü$/iu.test(name)) return `${name}’nde`;
  if (/köşk$/iu.test(name)) return `${name}’te`;
  return `${name} köşkünde`;
}

const TR_COUNTS = [
  "sıfır",
  "bir",
  "iki",
  "üç",
  "dört",
  "beş",
  "altı",
  "yedi",
  "sekiz",
  "dokuz",
  "on",
];

/**
 * "iki" for 2 and "İki" for sentence-initial use: the design writes small
 * counts out in Turkish prose. Past ten, and in other languages, the digits.
 */
export function countWord(
  count: number,
  locale: string,
  capital = false
): string {
  if (!locale.toLowerCase().startsWith("tr") || count < 0 || count > 10) {
    return String(count);
  }
  const word = TR_COUNTS[count] ?? String(count);
  return capital
    ? word.replace(/^i/u, "İ").replace(/^./u, (c) => c.toUpperCase())
    : word;
}
