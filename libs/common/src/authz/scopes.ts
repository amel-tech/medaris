/**
 * Authorization vocabulary — scopes, entities, and roles.
 *
 * Sources of truth:
 *   - `ONLINE MEDRESE SİSTEMİ- AUTHURIZATION - UZUN VADE PLAN.md` §3 (scopes)
 *     and §4 (per-entity matrices that the roles below participate in)
 *   - Authorization handoff document §3.1 (single-entity model) and §3.5
 *     (role union)
 *
 * Design decisions captured here:
 *   - **Single `flashcard-deck` entity, not 5 variants.** The deck variant
 *     (private / medrese / kosk / course) is a property of the resource
 *     ({@link ResourceRef.subType}) resolved at request time by the
 *     `RoleResolver` from the deck's row, not a separate matrix entity.
 *   - **`create_flashcard` and `manage_flashcards` are not split per deck
 *     variant.** Same scope, different roles allowed depending on the
 *     deck's subType — the dispatch lives in `RoleResolver.resolveDeckRole`.
 *   - **Roles never appear as Keycloak realm roles** except `SYSTEM_ADMIN`.
 *     Resource-level roles (KOSK_MANAGER, MUDERRIS, ENROLLED, …) are
 *     derived from enrollment/ownership tables by `RoleResolver` at
 *     request time — no JWT `resource_roles` claim, no identity-sync.
 */

/** Single source of truth for the scope union. New scopes are added here
 *  and propagate through type-checking. */
export const SCOPES = {
  // Temel
  VIEW: "view",
  VIEW_DETAILS: "view_details",
  EDIT: "edit",
  DELETE: "delete",
  // Hide / restore (MDRS-124). What the people who run things have instead of
  // DELETE: the row stays, reads stop returning it, and the same people can
  // bring it back. `DELETE` itself is on no role row — SYSTEM_ADMIN only.
  ARCHIVE: "archive",
  ENROLL: "enroll",
  // Öğrenci & kayıt
  MANAGE_ENROLLMENTS: "manage_enrollments",
  APPROVE_MUTALA: "approve_mutala",
  REQUEST_MUTALA_CHECK: "request_mutala_check",
  // Ders & eğitim
  ASSIGN_MUDERRIS: "assign_muderris",
  ASSIGN_HOMEWORK: "assign_homework",
  SUBMIT_HOMEWORK: "submit_homework",
  GRADE_HOMEWORK: "grade_homework",
  START_LIVE_LESSON: "start_live_lesson",
  JOIN_LIVE_LESSON: "join_live_lesson",
  CREATE_DISCUSSION: "create_discussion",
  MODERATE_DISCUSSION: "moderate_discussion",
  ACCESS_RECORDING: "access_recording",
  SHARE_RECORDING: "share_recording",
  GRANT_IJAZAH: "grant_ijazah",
  CREATE_EXAM: "create_exam",
  GRADE_EXAM: "grade_exam",
  // Ezber kartları (deck türünden bağımsız tek scope)
  CREATE_FLASHCARD: "create_flashcard",
  MANAGE_FLASHCARDS: "manage_flashcards",
  CREATE_PRIVATE_DECK: "create_private_deck",
  VIEW_PRIVATE_DECK: "view_private_deck",
  MANAGE_PRIVATE_DECK: "manage_private_deck",
  // İçerik & işbirliği
  ADD_ANNOTATION: "add_annotation",
  SHARE_ANNOTATION: "share_annotation",
  MANAGE_TAGS: "manage_tags",
  // Finans & bağış
  DONATE: "donate",
  MANAGE_DONATIONS: "manage_donations",
  // Köşk yönetimi
  CREATE_KOSK: "create_kosk",
  MANAGE_COURSES: "manage_courses",
  MANAGE_KOSK: "manage_kosk",
  // Add or remove a köşk's managers (MDRS-126). Its own scope rather than
  // EDIT, which a nazır of the köşk's medrese also holds: a nazır who could
  // make themselves a manager would gain KOSK_MANAGER on the köşk's courses,
  // which PRD §4.1 keeps out of a nazır's reach.
  MANAGE_KOSK_MANAGERS: "manage_kosk_managers",
  // Medrese yönetimi
  CREATE_MADRASAH: "create_madrasah",
  MANAGE_MADRASAH: "manage_madrasah",
  INVITE_NAZIR: "invite_nazir",
  REMOVE_NAZIR: "remove_nazir",
  MANAGE_MADRASAH_TAGS: "manage_madrasah_tags",
  MANAGE_MADRASAH_FLASHCARD_DECKS: "manage_madrasah_flashcard_decks",
  VIEW_MADRASAH_ANALYTICS: "view_madrasah_analytics",
  // Sistem yönetimi
  SYSTEM_ADMIN: "system_admin",
  MANAGE_GLOBAL_FLASHCARD_DECKS: "manage_global_flashcard_decks",
  MANAGE_PUBLIC_TAGS: "manage_public_tags",
  MANAGE_ALL_RESOURCES: "manage_all_resources",
} as const;
export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

/** Entities the matrix knows how to authorize against. Sub-content
 *  entities listed in plan §4.5 (lesson-recording, exam, homework,
 *  annotation, discussion-room) authorize against their owning course
 *  and so are not separate entities here. */
export const ENTITIES = {
  COURSE: "course",
  KOSK: "kosk",
  MADRASAH: "madrasah",
  FLASHCARD_DECK: "flashcard-deck",
  IJAZAH: "ijazah",
} as const;
export type Entity = (typeof ENTITIES)[keyof typeof ENTITIES];

/** Roles the matrix references. Only `SYSTEM_ADMIN` lives in Keycloak as
 *  a realm role; the rest are computed by `RoleResolver` from the
 *  domain's enrollment/ownership tables at request time.
 *
 *  `PUBLIC` is the role a `RoleResolver` returns explicitly to mean "any
 *  authenticated caller may act here" — for example, anyone viewing a
 *  public deck. It is not a fallback: `AuthzService.can` treats a `null`
 *  result from the resolver as a hard deny, so a resolver must return
 *  `PUBLIC` on purpose to open a resource.
 *
 *  `ANONYMOUS` is the other half of the plan's overloaded `GUEST`: a caller
 *  with no token at all (MDRS-45). It is kept apart from `PUBLIC` on purpose
 *  — `PUBLIC` rows carry scopes such as `CREATE_PRIVATE_DECK` that need an
 *  identity to act on — and it does NOT inherit the `PUBLIC` row. Only
 *  `RoleResolver.resolveAnonymous` returns it, and only for a handler marked
 *  `@AuthzPublic()`. */
export const ROLES = {
  SYSTEM_ADMIN: "SYSTEM_ADMIN",
  MADRASAH_NAZIR: "MADRASAH_NAZIR",
  KOSK_MANAGER: "KOSK_MANAGER",
  MUDERRIS: "MUDERRIS",
  ENROLLED: "ENROLLED",
  PENDING: "PENDING",
  DECK_OWNER: "DECK_OWNER",
  PUBLIC: "PUBLIC",
  ANONYMOUS: "ANONYMOUS",
} as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];

/** The only role `RoleResolver.resolveAnonymous` may return. Narrowed in the
 *  type so a resolver cannot hand an anonymous caller `PUBLIC` — and with it
 *  every scope that assumes an identity. */
export type AnonymousRole = typeof ROLES.ANONYMOUS;

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
