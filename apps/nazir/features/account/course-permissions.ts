import { type Read, readOnce } from "~/lib/tedrisat-read";

/**
 * What the caller holds in one course, from `GET /courses/:id/my-permissions`.
 * It is the answer the course's own routes give, so a page opens on it and a
 * button is drawn from it; it decides nothing, and every write is still
 * decided by the route it calls.
 */
export type CoursePermissions = ReadonlySet<string>;

/** The permission codes the course pages ask for. */
export const CODES = {
  courseEdit: "course.edit",
  sessionManage: "session.manage",
  sessionLiveLink: "session.live_link",
  staffRead: "course.staff_read",
  enrollmentDecide: "enrollment.decide",
  enrollmentComplete: "enrollment.complete",
  enrollmentRemove: "enrollment.remove",
  recordingManage: "recording.manage",
} as const;

/** The codes that open each page: holding any one of them is enough. */
export const PAGE_CODES = {
  sessions: [CODES.sessionManage, CODES.sessionLiveLink],
  plan: [CODES.sessionManage],
  students: [
    CODES.staffRead,
    CODES.enrollmentDecide,
    CODES.enrollmentComplete,
    CODES.enrollmentRemove,
  ],
  curriculum: [CODES.courseEdit, CODES.sessionManage],
  recordings: [CODES.recordingManage],
} as const satisfies Record<string, readonly string[]>;

export const holds = (held: CoursePermissions, code: string): boolean =>
  held.has(code);

export const holdsAny = (
  held: CoursePermissions,
  codes: readonly string[]
): boolean => codes.some((code) => held.has(code));

/** `GET /courses/:id/my-permissions`; a 404 is the portal's 404, as for the course. */
export async function readCoursePermissions(
  courseId: string
): Promise<Read<CoursePermissions>> {
  const read = await readOnce("what the caller holds in the course", (api) =>
    api.courses.getMyCoursePermissions({ id: courseId })
  );
  return read.status === "ok"
    ? { status: "ok", data: new Set(read.data.permissions) }
    : read;
}

/**
 * Whether a course page opens. A read that failed is `failed`, the retry state,
 * and is never taken for an answer either way; a read that was refused, or a
 * caller who holds none of the page's codes, is `forbidden`.
 */
export function pageGate(
  reads: readonly Read<unknown>[],
  permissions: Read<CoursePermissions>,
  codes: readonly string[]
): "ok" | "forbidden" | "failed" {
  const all = [...reads, permissions];
  if (all.some((read) => read.status === "failed")) return "failed";
  if (all.some((read) => read.status === "forbidden")) return "forbidden";
  return permissions.status === "ok" && holdsAny(permissions.data, codes)
    ? "ok"
    : "forbidden";
}
