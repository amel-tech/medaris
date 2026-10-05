import {
  type IAuthzFacts,
  type IHeldGrantCodes,
  type IHeldRole,
  PERMISSIONS,
  rolesConferring,
} from "@medaris/common";
import {
  ASSIGNED_ROLES,
  type AssignedRole,
  SCOPE_TYPES,
  type ScopeType,
} from "../../database/schema/role-assignment.schema";
import { KADEME } from "../../madrasah/nazir/madrasah-permission.service";

/**
 * Where the caller stands on a course's ders nazırları (MDRS-270):
 *
 * - a giver appoints, gives (up to the ceiling), changes and ends any post,
 *   and gives at `authority`, the level of their own seat;
 * - an appointer holds `course_nazir.assign` by a grant only: they appoint
 *   with no permission and end the posts they appointed (no re-delegation,
 *   d-1001-07; "kendi atadıklarını", d-1004-28);
 * - outside: the route let them in, but this course is not theirs to staff
 *   (a köşk nazımı alone in a medrese course).
 */
export type CourseStanding =
  | { kind: "giver"; authority: ScopeType }
  | { kind: "appointer" }
  | { kind: "outside" };

/**
 * The roles whose own `permission.grant` reaches a course, with the level each
 * gives at. `permission.grant` is never grantable, so no grant puts anyone
 * here.
 */
export const GIVER_LEVEL: Partial<Record<AssignedRole, ScopeType>> = {
  [ASSIGNED_ROLES.MUDERRIS]: SCOPE_TYPES.COURSE,
  [ASSIGNED_ROLES.MEDRESE_BASMUDERRIS]: SCOPE_TYPES.MADRASAH,
  [ASSIGNED_ROLES.KOSK_NAZIM]: SCOPE_TYPES.KOSK,
};

/**
 * The caller's standing, from the engine's own computation over what they
 * hold (`rolesConferring`): each role is asked alone, so a role with no power
 * of its own never lifts one that has. In a medrese course the köşk nazımı's
 * seat does not count (d-1001-35, d-1001-05: the köşk keeps out of the
 * medrese's own flow); the engine leaves both codes to it there, so the rule
 * is this function's, not the catalogue's. A caller with several giving seats
 * gives at the highest (course < medrese < köşk).
 */
export function courseStandingOf(
  facts: IAuthzFacts,
  roles: readonly IHeldRole[],
  grants: readonly IHeldGrantCodes[],
  now: Date = new Date()
): CourseStanding {
  const counted = (conferring: AssignedRole[]) =>
    facts.madrasahCourse
      ? conferring.filter((role) => role !== ASSIGNED_ROLES.KOSK_NAZIM)
      : conferring;
  const levels = counted(
    rolesConferring(facts, roles, grants, [PERMISSIONS.PERMISSION_GRANT], now)
  ).flatMap((role) => GIVER_LEVEL[role] ?? []);
  if (levels.length > 0) {
    return {
      kind: "giver",
      authority: levels.reduce((a, b) => (KADEME[b] > KADEME[a] ? b : a)),
    };
  }
  const assigners = counted(
    rolesConferring(
      facts,
      roles,
      grants,
      [PERMISSIONS.COURSE_NAZIR_ASSIGN],
      now
    )
  );
  return assigners.length > 0 ? { kind: "appointer" } : { kind: "outside" };
}
