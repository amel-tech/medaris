import type { EffectivePermissionGroup } from "@medaris/services/tedrisat";
import { getEffectivePermissions } from "./reads";

/**
 * Whether the caller's permissions name one of `codes` in the course: a group
 * of the course scope that lists the course (or every course, a grant without
 * an id) and carries the code. This is "may", not "does": a role held in
 * several courses is one group whose codes are the union over its scopes, so
 * the answer can be yes for a course where only a sibling holds the code. The
 * page then opens and the API refuses the write, which is the check that
 * counts. Köşk and platform scopes are not read here.
 */
export function holdsInCourse(
  groups: readonly EffectivePermissionGroup[],
  courseId: string,
  codes: readonly string[]
): boolean {
  return groups.some(
    (group) =>
      group.scopeType === "course" &&
      group.scopes.some(
        (scope) =>
          scope.type === "course" && (!scope.id || scope.id === courseId)
      ) &&
      group.permissions.some((code) => codes.includes(code))
  );
}

/**
 * Whether a course page that reads `GET /courses/:id` may open for the caller.
 * `contentLocked` is the API's `view_details` rule, not a staff test: it is
 * false for the müderris, the köşk manager and the enrolled talebe, and true
 * for a ders nazırı, who holds none of those roles and is given permissions
 * instead. So a locked course is not yet a refusal: it opens when the caller's
 * permissions name one of `codes` in this course. A permissions read that
 * fails is `failed`, not a refusal.
 */
export async function courseAccess(
  course: { contentLocked: boolean },
  courseId: string,
  codes: readonly string[]
): Promise<"ok" | "forbidden" | "failed"> {
  if (!course.contentLocked) return "ok";
  const groups = await getEffectivePermissions();
  if (groups === null) return "failed";
  return holdsInCourse(groups, courseId, codes) ? "ok" : "forbidden";
}
