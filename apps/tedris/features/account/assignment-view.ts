import type { AssignmentResponse } from "@medaris/services/tedrisat";

export type AssignmentApp = "nizam" | "nazir";

/**
 * Where a role is carried out (tedris 43): köşk nazımı in Nizam, everything
 * the medrese and the course own in Nazır. The account page only points there.
 */
export const roleApp = (role: string): AssignmentApp =>
  role === "MEDARIS_NAZIM" || role === "KOSK_NAZIM" ? "nizam" : "nazir";

export type ScopeBadge = "published" | "draft" | "hidden";

/** The badge beside a course: hidden wins over its published/draft state. */
export const courseBadge = (
  course: AssignmentResponse["course"]
): ScopeBadge | null => {
  if (!course) return null;
  if (course.hidden) return "hidden";
  return course.status === "PUBLISHED" ? "published" : "draft";
};

const trimSlash = (url: string) => url.replace(/\/+$/, "");

/**
 * The page the button opens, or null when the target app's address is not set.
 * A köşk goes to its page in Nizam, a course to its page in Nazır; a role with
 * no page of its own (the platform, a medrese) goes to the app's root. The
 * paths are the apps' own route names; Nazır has no course page yet, so that
 * link is not verified against a real route.
 */
export const openUrl = (
  assignment: Pick<AssignmentResponse, "role" | "scopeType" | "scopeId">,
  urls: { nizam?: string; nazir?: string }
): string | null => {
  const app = roleApp(assignment.role);
  const base = app === "nizam" ? urls.nizam : urls.nazir;
  if (!base) return null;
  const root = trimSlash(base);
  if (assignment.scopeId && assignment.scopeType === "kosk") {
    return `${root}/kosks/${assignment.scopeId}`;
  }
  if (assignment.scopeId && assignment.scopeType === "course") {
    return `${root}/courses/${assignment.scopeId}`;
  }
  return root;
};

/** The second line of the scope cell: the köşk, then the medrese, when there is one. */
export const scopeMeta = (
  assignment: Pick<AssignmentResponse, "scopeType" | "course">
): string[] => {
  const course = assignment.course;
  if (!course) return [];
  return [course.koskName, course.madrasahName].filter((part): part is string =>
    Boolean(part)
  );
};
