import { PERMISSIONS, type PermissionCode } from "./permissions";
import { ENTITIES, type Entity } from "./scopes";

const P = PERMISSIONS;

/**
 * What a caller is to a resource when no role or grant is involved: the
 * relationship a `RoleResolver` finds from the domain's own tables.
 *
 * `PUBLIC` means "any authenticated caller" and is never a fallback: a
 * resolver answers it on purpose, and a `null` answer is a hard deny.
 * `ANONYMOUS` is a caller with no token at all (MDRS-45) and does not inherit
 * `PUBLIC`, whose codes assume an identity to act as.
 */
export const RELATIONS = {
  PUBLIC: "PUBLIC",
  ANONYMOUS: "ANONYMOUS",
  ENROLLED: "ENROLLED",
  PENDING: "PENDING",
  DECK_OWNER: "DECK_OWNER",
} as const;
export type Relation = (typeof RELATIONS)[keyof typeof RELATIONS];

/** The only relation `RoleResolver.resolveAnonymous` may answer. */
export type AnonymousRelation = typeof RELATIONS.ANONYMOUS;

/**
 * Implicit codes by entity and relationship: the rows of the old matrix that
 * were not about a role. Every authenticated relationship also holds the
 * entity's `PUBLIC` codes, as it did under the matrix (a talebe may still
 * enrol in a second course).
 *
 * `DELETE` is on no row (MDRS-124): nobody who runs a köşk or teaches a course
 * deletes anything, they hide it, and only SYSTEM_ADMIN deletes for real,
 * through the realm bypass.
 */
export const RELATION_CODES: Record<
  Entity,
  Partial<Record<Relation, readonly PermissionCode[]>>
> = {
  [ENTITIES.COURSE]: {
    // The course page is public, its lessons are not (owner, 26 September):
    // `course.view` is the page, `course.view_details` is the content
    // (meeting links, agendas, kaynak, resource URLs), which starts at ENROLLED.
    [RELATIONS.PUBLIC]: [P.COURSE_VIEW, P.COURSE_ENROLL],
    [RELATIONS.ENROLLED]: [P.COURSE_VIEW, P.COURSE_VIEW_DETAILS],
    [RELATIONS.PENDING]: [P.COURSE_VIEW],
    [RELATIONS.ANONYMOUS]: [P.COURSE_VIEW],
  },
  [ENTITIES.KOSK]: {
    [RELATIONS.PUBLIC]: [P.KOSK_VIEW],
    [RELATIONS.ANONYMOUS]: [P.KOSK_VIEW],
  },
  [ENTITIES.MADRASAH]: {
    [RELATIONS.PUBLIC]: [P.MADRASAH_VIEW],
    [RELATIONS.ANONYMOUS]: [P.MADRASAH_VIEW],
  },
  [ENTITIES.FLASHCARD_DECK]: {
    [RELATIONS.DECK_OWNER]: [
      P.DECK_VIEW,
      P.DECK_CREATE_CARD,
      P.DECK_MANAGE_PRIVATE,
      P.DECK_MANAGE_CARDS,
    ],
    [RELATIONS.PUBLIC]: [P.DECK_VIEW, P.DECK_CREATE_PRIVATE],
    [RELATIONS.ANONYMOUS]: [P.DECK_VIEW],
  },
};

/** The codes a relationship holds on an entity, with the `PUBLIC` ones it inherits. */
export function relationCodes(
  entity: Entity,
  relation: Relation
): readonly PermissionCode[] {
  const rows = RELATION_CODES[entity] ?? {};
  const own = rows[relation] ?? [];
  if (relation === RELATIONS.ANONYMOUS || relation === RELATIONS.PUBLIC) {
    return own;
  }
  return [...own, ...(rows[RELATIONS.PUBLIC] ?? [])];
}
