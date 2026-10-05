import type { AssignmentResponse } from "@medaris/services/tedrisat";

/** The roles Nizam is for: the platform's and the köşk's nazım, and the realm's SYSTEM_ADMIN. */
const NIZAM_ROLES: ReadonlySet<string> = new Set([
  "MEDARIS_NAZIM",
  "KOSK_NAZIM",
]);

export type Landing = "nizam" | "nazar" | "none";

/**
 * Where a signed-in person belongs when they open Nizam (nizam 04):
 * a nazım, or SYSTEM_ADMIN, stays; someone whose only roles are the medrese's
 * and the course's is sent to the "Bu işler Nazır'da" page; someone with no
 * role has no page of their own here yet and also stays.
 */
export function landingFor(me: {
  systemAdmin: boolean;
  assignments: Pick<AssignmentResponse, "role">[];
}): Landing {
  if (me.systemAdmin) return "nizam";
  if (me.assignments.some((a) => NIZAM_ROLES.has(a.role))) return "nizam";
  return me.assignments.length > 0 ? "nazar" : "none";
}

export interface TaskRow {
  id: string;
  kind: "madrasah" | "course";
  title: string;
  roleKey: string;
  isImam: boolean;
  draft: boolean;
  koskName: string | null;
  /** null for a draft: it has no talebe count to show */
  studentCount: number | null;
}

const MADRASAH_ROLES: ReadonlySet<string> = new Set([
  "MEDRESE_BASMUDERRIS",
  "MEDRESE_NAZIR",
]);
const COURSE_ROLES: ReadonlySet<string> = new Set(["MUDERRIS", "DERS_NAZIR"]);

/** The list the page shows: medrese roles first, then course roles; Nizam's own roles are not its business. */
export function taskRows(assignments: AssignmentResponse[]): TaskRow[] {
  const madrasahs: TaskRow[] = [];
  const courses: TaskRow[] = [];
  for (const a of assignments) {
    if (MADRASAH_ROLES.has(a.role)) {
      madrasahs.push({
        id: a.id,
        kind: "madrasah",
        title: a.scopeName ?? "",
        roleKey: a.role,
        isImam: false,
        draft: false,
        koskName: null,
        studentCount: null,
      });
    } else if (COURSE_ROLES.has(a.role)) {
      const draft = a.course?.status === "DRAFT";
      courses.push({
        id: a.id,
        kind: "course",
        title: a.scopeName ?? "",
        roleKey: a.role,
        isImam: a.isImam,
        draft,
        koskName: a.course?.koskName ?? null,
        studentCount: draft ? null : (a.course?.studentCount ?? 0),
      });
    }
  }
  return [...madrasahs, ...courses];
}
