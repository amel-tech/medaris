import type {
  RemovedEnrollmentResponse,
  RosterEnrollmentResponse,
} from "@medaris/services/tedrisat";
import { shortDay } from "~/lib/dates";
import type { Messages } from "~/lib/i18n/messages";

/**
 * Talebeler of a course (the müderris's and the ders nazırı's) as rules: how
 * the course's enrolments are told apart into applications, the enrolled, the
 * ones who completed it and the ones taken out of it, how a row is worded and
 * dated, the search over a list, and which sentence a refusal gets. Pure on
 * purpose, so that the page and the tables have nothing to decide. The
 * decisions on an application (`approveApplication`, `rejectApplication`) are
 * the Pano's, and so are their sentences.
 */

export type Tab = "applications" | "enrolled" | "completed" | "removed";

export const TABS: readonly Tab[] = [
  "applications",
  "enrolled",
  "completed",
  "removed",
];

/** How many talebe a table shows before "Daha fazla göster". */
export const ROSTER_PAGE = 10;

export const studentsHref = (courseId: string): string =>
  `/ders/${encodeURIComponent(courseId)}/talebeler`;

export interface Day {
  label: string;
  iso: string;
}

type Where = { locale: string; timeZone: string; now: Date };

const dayOf = (at: Date | string, where: Where): Day => ({
  label: shortDay(new Date(at), where.now, where),
  iso: new Date(at).toISOString(),
});

/** One waiting application. */
export interface ApplicationRow {
  userId: string;
  name: string;
  email: string | null;
  at: Day;
}

/** One talebe holding a seat, or having completed the course. */
export interface RosterRow {
  userId: string;
  name: string;
  email: string | null;
  /** the talebe's own progress, 0 to 100 */
  progress: number;
  joined: Day;
}

/** One removal, newest first. */
export interface RemovedRow {
  key: string;
  name: string;
  email: string | null;
  at: Day;
  reason: string;
  /** who took them out; "Adı bilinmiyor" when the account has no name */
  by: string;
}

export interface Lists {
  applications: ApplicationRow[];
  enrolled: RosterRow[];
  completed: RosterRow[];
}

type Person = { studentName?: string | null; studentEmail?: string | null };

const nameOf = (person: Person, t: Messages): string =>
  person.studentName?.trim() ||
  person.studentEmail ||
  t("CourseStudents.unnamed");

/** The course's enrolments told apart by state; a revoked seat is on the removed list, not here. */
export function listsOf(
  enrolments: readonly RosterEnrollmentResponse[],
  t: Messages,
  where: Where
): Lists {
  const lists: Lists = { applications: [], enrolled: [], completed: [] };
  for (const item of enrolments) {
    const person = {
      userId: item.userId,
      name: nameOf(item, t),
      email: item.studentEmail ?? null,
    };
    switch (item.status) {
      case "PENDING":
        lists.applications.push({
          ...person,
          at: dayOf(item.createdAt, where),
        });
        break;
      case "ENROLLED":
      case "COMPLETED":
        lists[item.status === "ENROLLED" ? "enrolled" : "completed"].push({
          ...person,
          progress: item.progress,
          joined: dayOf(item.createdAt, where),
        });
        break;
      default:
        break;
    }
  }
  lists.applications.sort(
    (a, b) => Date.parse(b.at.iso) - Date.parse(a.at.iso)
  );
  return lists;
}

export function removedRows(
  removed: readonly RemovedEnrollmentResponse[],
  t: Messages,
  where: Where
): RemovedRow[] {
  return removed.map((item, index) => ({
    key: `${item.userId}:${new Date(item.removedAt).toISOString()}:${index}`,
    name: item.name?.trim() || item.email || t("CourseStudents.unnamed"),
    email: item.email,
    at: dayOf(item.removedAt, where),
    reason: item.reason,
    by: item.removedBy.name?.trim() || t("Nazirs.unknownPerson"),
  }));
}

// ---- search ---------------------------------------------------------------------------

/** Text compared the way a person types it: case- and diacritic-insensitive, in Turkish. */
const fold = (text: string): string =>
  text
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ı/g, "i");

/** The people whose name or e-mail holds the search text, in the order given; an empty search keeps everyone. */
export function matching<T extends { name: string; email: string | null }>(
  list: readonly T[],
  query: string
): T[] {
  const needle = fold(query.trim());
  if (!needle) return [...list];
  return list.filter((person) =>
    fold(`${person.name} ${person.email ?? ""}`).includes(needle)
  );
}

/** By name in Turkish order. */
export const byName = <T extends { name: string }>(
  list: readonly T[],
  direction: "ascending" | "descending"
): T[] =>
  [...list].sort(
    (a, b) =>
      (direction === "descending" ? -1 : 1) * a.name.localeCompare(b.name, "tr")
  );

// ---- what a row offers ----------------------------------------------------------------

export type RosterAction = "complete" | "reopen" | "remove";

/** Which of the course's three decisions on a seat the caller holds. */
export interface RosterPermissions {
  /** `enrollment.decide`: Onayla and Reddet */
  decide: boolean;
  /** `enrollment.complete`: Tamamladı say and Yeniden aç */
  complete: boolean;
  /** `enrollment.remove`: Dersten çıkar */
  remove: boolean;
}

/** The decision each button of a row needs. */
const ACTION_NEEDS: Record<RosterAction, keyof RosterPermissions> = {
  complete: "complete",
  reopen: "complete",
  remove: "remove",
};

/**
 * The buttons of a talebe's row, in display order, for what the caller holds:
 * a held seat is completed or taken out; a completion is reopened. COMPLETED
 * is set by the course team and never by the talebe, so it is only ever
 * offered here.
 */
export const rosterActions = (
  tab: "enrolled" | "completed",
  can: RosterPermissions
): RosterAction[] =>
  (tab === "enrolled"
    ? (["complete", "remove"] as const)
    : (["reopen"] as const)
  ).filter((action) => can[ACTION_NEEDS[action]]);

// ---- what the API refuses -------------------------------------------------------------

/** The message key (from the catalogue's root) of a refused write on a seat, from the code the API answered with. */
export function enrolmentErrorKey(code: string): string {
  switch (code) {
    case "AUTHZ_FORBIDDEN":
      return "Problems.actionForbidden";
    case "ENROLLMENT_NOT_FOUND":
    case "ENROLLMENT_STATE_CONFLICT":
      return "CourseStudents.errors.gone";
    default:
      return "Problems.actionGeneric";
  }
}

/** Whether the answer means the seat is no longer as the page showed it, so the list is read again. */
export const seatMoved = (code: string): boolean =>
  code === "ENROLLMENT_NOT_FOUND" || code === "ENROLLMENT_STATE_CONFLICT";
