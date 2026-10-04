/**
 * The vocabulary of who holds what where (MDRS-133, MDRS-134, MDRS-135). The
 * values are the ones the `role_assignments` and `permission_grants` columns
 * store; tedrisat's schema files keep their own copy of the same strings for
 * drizzle-kit, and `assignments.spec.ts` pins the two lists together.
 */

/** The kinds of scope a role or a grant is held in. `platform` has no id. */
export const SCOPE_TYPES = {
  PLATFORM: "platform",
  KOSK: "kosk",
  MADRASAH: "madrasah",
  COURSE: "course",
} as const;
export type ScopeType = (typeof SCOPE_TYPES)[keyof typeof SCOPE_TYPES];

/**
 * The six scoped roles of role model v2. The Medaris başnazımı is not one of
 * them: it stays the Keycloak `SYSTEM_ADMIN` realm role.
 */
export const ASSIGNED_ROLES = {
  MEDARIS_NAZIM: "MEDARIS_NAZIM",
  KOSK_NAZIM: "KOSK_NAZIM",
  MEDRESE_BASMUDERRIS: "MEDRESE_BASMUDERRIS",
  MEDRESE_NAZIR: "MEDRESE_NAZIR",
  MUDERRIS: "MUDERRIS",
  DERS_NAZIR: "DERS_NAZIR",
} as const;
export type AssignedRole = (typeof ASSIGNED_ROLES)[keyof typeof ASSIGNED_ROLES];

/** Each role lives in exactly one kind of scope. */
export const ROLE_SCOPE_TYPES: Record<AssignedRole, ScopeType> = {
  MEDARIS_NAZIM: SCOPE_TYPES.PLATFORM,
  KOSK_NAZIM: SCOPE_TYPES.KOSK,
  MEDRESE_BASMUDERRIS: SCOPE_TYPES.MADRASAH,
  MEDRESE_NAZIR: SCOPE_TYPES.MADRASAH,
  MUDERRIS: SCOPE_TYPES.COURSE,
  DERS_NAZIR: SCOPE_TYPES.COURSE,
};

/** One scope: `id` is null for the platform and for "every scope of that type". */
export interface ScopeRef {
  type: ScopeType;
  id: string | null;
}

/**
 * The scope a role is the manager of: the köşk's nazımı, the medrese's
 * başmüderris and the course's müderris. A scope that once had one and has
 * none now is passive (MDRS-136).
 */
export const MANAGER_ROLE_OF: Partial<Record<ScopeType, AssignedRole>> = {
  kosk: ASSIGNED_ROLES.KOSK_NAZIM,
  madrasah: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
  course: ASSIGNED_ROLES.MUDERRIS,
};
