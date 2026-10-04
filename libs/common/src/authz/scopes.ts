/**
 * Authorization vocabulary — entities, the realm role and the resource
 * reference.
 *
 * What a caller may do is a catalogue permission (`permissions.ts`), decided
 * from the caller's relationship to the resource (`relations.ts`), the roles
 * and grants they hold in the scopes the resource sits in
 * (`effective-permissions.ts`) and the policies on those scopes. There is no
 * static role × scope matrix any more (MDRS-135).
 *
 * Design decisions kept from the matrix (MDRS-41):
 *   - **Single `flashcard-deck` entity, not 5 variants.** The deck variant
 *     (private / medrese / kosk / course) is a property of the resource
 *     ({@link ResourceRef.subType}) resolved at request time, not a separate
 *     entity.
 *   - **Roles never appear as Keycloak realm roles** except `SYSTEM_ADMIN`.
 *     The scoped roles live in `role_assignments`; relationships (enrolled,
 *     deck owner, …) are derived from enrollment and ownership tables.
 */

/** Entities a decision is made about. Sub-content (recordings, sessions,
 *  enrolments) authorizes against its owning course and so is not a separate
 *  entity here. `ijazah` returns with the icazet record (MDRS-149). */
export const ENTITIES = {
  COURSE: "course",
  KOSK: "kosk",
  MADRASAH: "madrasah",
  FLASHCARD_DECK: "flashcard-deck",
} as const;
export type Entity = (typeof ENTITIES)[keyof typeof ENTITIES];

/** The one role that lives in Keycloak: the Medaris başnazımı. Every other
 *  role is a row in `role_assignments`. */
export const ROLES = {
  SYSTEM_ADMIN: "SYSTEM_ADMIN",
} as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];

/** Sub-type of a `flashcard-deck` resource. Resolved from the deck's row
 *  by `RoleResolver`; not part of the request payload. */
export type DeckSubType = "private" | "medrese" | "kosk" | "course";

/** Identifies a single resource for an authorization check. `subType`
 *  is reserved for entities whose role rules depend on a runtime
 *  property — today only `flashcard-deck` uses it. */
export interface ResourceRef {
  entity: Entity;
  id: string;
  subType?: DeckSubType;
}
