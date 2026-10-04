import {
  PERMISSION_META,
  PERMISSIONS,
  type PermissionCode,
  SCOPE_TYPES,
} from "@medaris/common";

/** Implicit and derived codes that are about a course but carry no scope tag. */
const COURSE_RELATION_CODES: readonly PermissionCode[] = [
  PERMISSIONS.COURSE_VIEW,
  PERMISSIONS.COURSE_VIEW_DETAILS,
  PERMISSIONS.COURSE_ENROLL,
  PERMISSIONS.COURSE_STAFF_READ,
  PERMISSIONS.COURSE_DELETE,
  PERMISSIONS.SETTING_APPROVAL_OFF,
  PERMISSIONS.SETTING_RECORDINGS_PUBLIC,
  PERMISSIONS.SETTING_COURSE_OPEN,
];

/**
 * What the başnazım holds in a course. The realm role is allowed everything
 * (`AuthzService.can` answers true before it reads any role or grant), so no
 * computation lies behind it; this is every code the catalogue ties to a
 * course: the ones tagged for the course scope and the course's own implicit
 * ones.
 */
export const SYSTEM_ADMIN_COURSE_CODES: readonly PermissionCode[] = (
  Object.values(PERMISSIONS) as PermissionCode[]
).filter(
  (code) =>
    COURSE_RELATION_CODES.includes(code) ||
    PERMISSION_META[code].scopes.includes(SCOPE_TYPES.COURSE)
);
