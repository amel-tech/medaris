import {
  earliestEnd,
  extrasBeyondGroup,
} from "../../assignment/admin/grant-plan";
import {
  MADRASAH_CODES,
  MADRASAH_COURSE_CODES,
} from "../../assignment/permission-catalog";
import {
  SCOPE_TYPES,
  type ScopeType,
} from "../../database/schema/role-assignment.schema";

/**
 * Where nazir/06's choices are stored, as plain data (MDRS-185). A nazır's
 * permissions live in `permission_grants`, one row per permission or group and
 * scope:
 *
 * - the "Medrese" permissions are held in the medrese;
 * - the "Medrese dersleri" permissions are held in the medrese too when "Hangi
 *   derslerde" says every course ("Bütün medrese dersleri, sonradan açılacak
 *   dersleri de kapsar"), and course by course when it names some;
 * - a group sits where its permissions do: in the medrese when it carries any
 *   medrese permission or covers every course, otherwise in each chosen course.
 */
export interface IGroupCodes {
  id: string;
  permissions: readonly string[];
}

export interface IWantedScope {
  scopeType: ScopeType;
  scopeId: string;
  groupId: string | null;
  permissions: string[];
}

/** A held grant row, as far as nazir/06 reads it. */
export interface IHeldTreeGrant {
  scopeType: ScopeType;
  scopeId: string | null;
  permission: string | null;
  groupId: string | null;
  expiresAt: Date | null;
}

const hasMedreseCode = (codes: readonly string[]) =>
  codes.some((code) => MADRASAH_CODES.has(code));

const hasCourseCode = (codes: readonly string[]) =>
  codes.some((code) => MADRASAH_COURSE_CODES.has(code));

/**
 * Why `courseIds` cannot be honoured, or null. A group that carries a medrese
 * permission is held in the medrese and so reaches every course; limiting it
 * would hand out more than was asked for, so it is refused instead.
 */
export function courseScopeProblem(
  group: IGroupCodes | null,
  extras: readonly string[],
  courseIds: readonly string[] | null
): "none-chosen" | "group-spans-medrese" | "no-course-permissions" | null {
  if (courseIds === null) return null;
  if (courseIds.length === 0) return "none-chosen";
  if (group && hasMedreseCode(group.permissions)) return "group-spans-medrese";
  const given = [...extras, ...(group?.permissions ?? [])];
  return hasCourseCode(given) ? null : "no-course-permissions";
}

/** The extras to store: the group's own codes are not repeated as single grants. */
export function extrasToStore(
  permissions: readonly string[],
  group: IGroupCodes | null
): string[] {
  return extrasBeyondGroup(permissions, group?.permissions ?? []);
}

/**
 * The scopes a request fills, each with the group and single permissions held
 * there. A scope that is not listed is wanted empty.
 */
export function wantedScopes(input: {
  madrasahId: string;
  group: IGroupCodes | null;
  /** Single permissions, already without what the group carries. */
  permissions: readonly string[];
  /** Null for every course of the medrese. */
  courseIds: readonly string[] | null;
}): IWantedScope[] {
  const { madrasahId, group, permissions, courseIds } = input;
  const buckets = new Map<string, IWantedScope>();
  const bucket = (scopeType: ScopeType, scopeId: string) => {
    const key = `${scopeType}:${scopeId}`;
    let found = buckets.get(key);
    if (!found) {
      found = { scopeType, scopeId, groupId: null, permissions: [] };
      buckets.set(key, found);
    }
    return found;
  };
  const courseScopes = (): Array<[ScopeType, string]> =>
    courseIds === null
      ? [[SCOPE_TYPES.MADRASAH, madrasahId]]
      : [...new Set(courseIds)].map((id) => [SCOPE_TYPES.COURSE, id]);

  for (const code of new Set(permissions)) {
    if (MADRASAH_CODES.has(code)) {
      bucket(SCOPE_TYPES.MADRASAH, madrasahId).permissions.push(code);
    } else {
      for (const [type, id] of courseScopes()) {
        bucket(type, id).permissions.push(code);
      }
    }
  }
  if (group) {
    const wholeMedrese =
      courseIds === null || hasMedreseCode(group.permissions);
    const where: Array<[ScopeType, string]> = wholeMedrese
      ? [[SCOPE_TYPES.MADRASAH, madrasahId]]
      : courseScopes();
    for (const [type, id] of where) bucket(type, id).groupId = group.id;
  }
  return [...buckets.values()];
}

/**
 * What the held rows say in nazir/06's terms, the inverse of `wantedScopes` for
 * what this route writes: the group, the single permissions, the courses they
 * are limited to (null: every course) and the earliest end.
 */
export function describeHeldGrants(held: readonly IHeldTreeGrant[]): {
  groupId: string | null;
  permissions: string[];
  courseIds: string[] | null;
  expiresAt: Date | null;
} {
  const courseIds = [
    ...new Set(
      held.flatMap((row) =>
        row.scopeType === SCOPE_TYPES.COURSE && row.scopeId ? [row.scopeId] : []
      )
    ),
  ];
  return {
    groupId: held.find((row) => row.groupId !== null)?.groupId ?? null,
    permissions: [
      ...new Set(
        held.flatMap((row) => (row.permission ? [row.permission] : []))
      ),
    ],
    courseIds: courseIds.length > 0 ? courseIds : null,
    expiresAt: earliestEnd(held.map((row) => row.expiresAt)),
  };
}
