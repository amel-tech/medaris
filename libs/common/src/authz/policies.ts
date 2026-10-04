import { SCOPE_TYPES, type ScopeType } from "./assignments";
import { PERMISSIONS, type PermissionCode } from "./permissions";

/**
 * The policies that close a permission (MDRS-135 §6). A policy is a setting on
 * the platform, a köşk or a medrese; while it is on it closes an ability in
 * every scope below it, and a scope's own settings cannot reopen it.
 *
 * `ALWAYS_REQUIRE_APPROVAL` and `RECORDINGS_NEVER_PUBLIC` live on all three
 * levels (platform_policies, kosks, madrasah_settings); the third lives on the
 * medrese alone. Where each is stored is the loader's business; what each
 * closes is this table's.
 */
export const POLICY_KEYS = {
  ALWAYS_REQUIRE_APPROVAL: "ALWAYS_REQUIRE_APPROVAL",
  RECORDINGS_NEVER_PUBLIC: "RECORDINGS_NEVER_PUBLIC",
  CLOSED_COURSE_REQUIRED: "CLOSED_COURSE_REQUIRED",
} as const;
export type PolicyKey = (typeof POLICY_KEYS)[keyof typeof POLICY_KEYS];

export const POLICY_CLOSES: Record<PolicyKey, readonly PermissionCode[]> = {
  ALWAYS_REQUIRE_APPROVAL: [PERMISSIONS.SETTING_APPROVAL_OFF],
  RECORDINGS_NEVER_PUBLIC: [PERMISSIONS.SETTING_RECORDINGS_PUBLIC],
  CLOSED_COURSE_REQUIRED: [PERMISSIONS.SETTING_COURSE_OPEN],
};

/** A policy that is on, and the scope that set it. */
export interface IPolicyOn {
  key: PolicyKey;
  level: ScopeType;
  scopeId: string | null;
}

/**
 * Whether `authority` is above `level`: platform ⊃ köşk ⊃ course and platform
 * ⊃ medrese ⊃ course, so a köşk's authority and a medrese's are not above one
 * another. A grant made by an authority above a policy's level widens one
 * person beyond that policy and beyond no other.
 */
export function authorityAbove(
  authority: ScopeType,
  level: ScopeType
): boolean {
  switch (authority) {
    case SCOPE_TYPES.PLATFORM:
      return level !== SCOPE_TYPES.PLATFORM;
    case SCOPE_TYPES.KOSK:
    case SCOPE_TYPES.MADRASAH:
      return level === SCOPE_TYPES.COURSE;
    default:
      return false;
  }
}
