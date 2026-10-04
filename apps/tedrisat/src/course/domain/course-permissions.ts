import {
  PERMISSION_META,
  PERMISSIONS,
  type PermissionCode,
  SCOPE_TYPES,
} from "@medaris/common";

/**
 * Codes about a course that carry no course tag: the implicit and derived
 * ones, and the köşk- and medrese-level codes a `/courses/:id` route accepts
 * (hide and restore, the müderris list), which the realm bypass passes.
 */
const COURSE_RELATION_CODES: readonly PermissionCode[] = [
  PERMISSIONS.COURSE_VIEW,
  PERMISSIONS.COURSE_VIEW_DETAILS,
  PERMISSIONS.COURSE_ENROLL,
  PERMISSIONS.COURSE_STAFF_READ,
  PERMISSIONS.COURSE_DELETE,
  PERMISSIONS.COURSE_HIDE,
  PERMISSIONS.MADRASAH_COURSE_HIDE,
  PERMISSIONS.COURSE_OPEN_STANDALONE,
  PERMISSIONS.MADRASAH_MUDERRIS_MANAGE,
  PERMISSIONS.SETTING_APPROVAL_OFF,
  PERMISSIONS.SETTING_RECORDINGS_PUBLIC,
  PERMISSIONS.SETTING_COURSE_OPEN,
];

/**
 * What the başnazım holds in a course. The realm role is allowed everything
 * (`AuthzService.can` answers true before it reads any role or grant), so no
 * computation lies behind it; this is every code the catalogue ties to a
 * course: the ones tagged for the course scope, the course's own implicit
 * ones, and the köşk and medrese codes its routes accept.
 */
export const SYSTEM_ADMIN_COURSE_CODES: readonly PermissionCode[] = (
  Object.values(PERMISSIONS) as PermissionCode[]
).filter(
  (code) =>
    COURSE_RELATION_CODES.includes(code) ||
    PERMISSION_META[code].scopes.includes(SCOPE_TYPES.COURSE)
);
