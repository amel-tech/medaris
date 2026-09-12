import {
  ENTITIES,
  ResourceRef,
  ROLES,
  Role,
  RoleResolver,
} from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { CourseRepository } from "../course/course.repository";
import { EnrollmentStatus } from "../course/domain/enrollment-status.enum";
import { FlashcardDeckRepository } from "../flashcard/flashcard-deck.repository";
import { KoskRepository } from "../kosk/kosk.repository";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves the caller's role on a given resource by consulting the
 * domain's ownership/enrollment tables — through the feature modules'
 * repositories, never through `DatabaseService` directly. Authorization
 * and the domain services therefore read ownership from one code path:
 * when the storage shape changes (the kosk→madrasah FK, a membership
 * table for köşk ownership), the repository method changes and both
 * readers follow.
 *
 * Returning `null` means **deny** — the caller has no role on this
 * resource and no public access is intended either. `AuthzService.can`
 * treats null as a hard deny (no `PUBLIC` fallback), so when a resource
 * is meant to be open to any authenticated caller (a public deck, a
 * non-existent ID on a create endpoint, the donate scope on a
 * madrasah), the resolver must explicitly return `ROLES.PUBLIC`.
 *
 * Wired entities so far: `flashcard-deck` (owner), `kosk` (manager),
 * `course` (manager / muderris / enrolled / pending). `madrasah` and
 * `ijazah` return `PUBLIC` provisionally so the open scopes documented in
 * plan §4 (view, donate) work. Restricted scopes (`MANAGE_*`, `EDIT`,
 * `DELETE`) deny because PUBLIC does not list them — they will become
 * role-based once each entity's resolver lands.
 *
 * Priority rules for multi-role situations:
 *   - KOSK_MANAGER > MUDERRIS > ENROLLED > PENDING
 *   - MADRASAH_NAZIR > KOSK_MANAGER (when the kosk belongs to the nazır's medrese)
 *   - SYSTEM_ADMIN bypass is handled upstream in `AuthzService.isSystemAdmin`,
 *     not here.
 */
@Injectable()
export class TedrisatRoleResolver implements RoleResolver {
  constructor(
    private readonly koskRepo: KoskRepository,
    private readonly courseRepo: CourseRepository,
    private readonly deckRepo: FlashcardDeckRepository
  ) {}

  async resolve(userId: string, resource: ResourceRef): Promise<Role | null> {
    switch (resource.entity) {
      case ENTITIES.FLASHCARD_DECK:
        return this.resolveDeckRole(userId, resource);
      case ENTITIES.KOSK:
        return this.resolveKoskRole(userId, resource);
      case ENTITIES.COURSE:
        return this.resolveCourseRole(userId, resource);
      case ENTITIES.MADRASAH:
      case ENTITIES.IJAZAH:
        // TODO(authz): wire nazır / ijazah tables as they land. Until
        // then, PUBLIC keeps the entity's PUBLIC matrix row working
        // (e.g. madrasah donate). Restricted scopes are denied because
        // PUBLIC does not list them.
        return ROLES.PUBLIC;
      default:
        return null;
    }
  }

  /**
   * Deck role dispatch. Schema realises two variants: `isPublic = false`
   * (private) and `isPublic = true` (global). Other variants from plan
   * §4.2 will land with their foreign keys.
   *
   * - Non-UUID id ("new" used by the POST endpoint, malformed input):
   *   return PUBLIC so `CREATE_PRIVATE_DECK` on the matrix's PUBLIC row
   *   applies. Defends against Postgres 22P02.
   * - Deck missing: return PUBLIC. The handler will 404 separately;
   *   the resolver shouldn't leak existence by switching outcomes here.
   * - Caller authored the deck: DECK_OWNER — checked BEFORE `isPublic`.
   *   `isPublic` is a user-settable visibility flag on a user-authored
   *   row, not an admin flag; testing it first turned the author of a
   *   public deck into PUBLIC and locked them out of every owner scope on
   *   their own deck, with no way back since flipping the flag is itself
   *   owner-scoped (review finding on MDRS-41).
   * - Public deck, not the author: PUBLIC (any authenticated caller may view).
   * - Private deck, not the author: null → strict deny.
   */
  private async resolveDeckRole(
    userId: string,
    resource: ResourceRef
  ): Promise<Role | null> {
    if (!UUID_REGEX.test(resource.id)) return ROLES.PUBLIC;

    const deck = await this.deckRepo.findById(resource.id);
    if (!deck) return ROLES.PUBLIC;
    if (deck.authorId === userId) return ROLES.DECK_OWNER;
    return deck.isPublic ? ROLES.PUBLIC : null;
  }

  /**
   * Köşk role dispatch.
   *
   * - Non-UUID id ("new" sentinel, malformed input): PUBLIC, which grants
   *   VIEW only. `CREATE_KOSK` is deliberately on NO kosk matrix row (see
   *   auth-matrix.ts, the comment above the kosk PUBLIC row): köşk
   *   creation is SYSTEM_ADMIN-only through the realm bypass. Do NOT add
   *   `CREATE_KOSK` to the PUBLIC row to make a create endpoint pass —
   *   that hands köşk creation to every authenticated user.
   * - Köşk missing: PUBLIC. Mirrors the deck pattern — the controller
   *   surfaces 404 later when its own query returns nothing.
   * - Caller owns the köşk: KOSK_MANAGER.
   * - Otherwise: PUBLIC. Anyone authenticated may VIEW; EDIT/DELETE
   *   are not on the PUBLIC row so non-owners are denied.
   *
   * MADRASAH_NAZIR path is deferred until kosk→madrasah FK lands.
   */
  private async resolveKoskRole(
    userId: string,
    resource: ResourceRef
  ): Promise<Role | null> {
    if (!UUID_REGEX.test(resource.id)) return ROLES.PUBLIC;

    const ownerId = await this.koskRepo.findOwnerId(resource.id);
    if (ownerId === null) return ROLES.PUBLIC;
    return ownerId === userId ? ROLES.KOSK_MANAGER : ROLES.PUBLIC;
  }

  /**
   * Course role dispatch.
   *
   * Priority (highest first):
   *   1. KOSK_MANAGER — caller owns the course's parent köşk
   *   2. MUDERRIS     — caller is listed in `course_muderris` for this course
   *   3. ENROLLED     — caller has an `ENROLLED` (or `COMPLETED`) enrollment
   *   4. PENDING      — caller has a `PENDING` enrollment awaiting approval
   *   5. PUBLIC       — any authenticated caller (covers ENROLL on a course
   *                     that exists)
   *
   * Two round trips, not four: only the parent-köşk lookup depends on the
   * course row (it needs `koskId`); the muderris and enrollment lookups
   * need nothing but the course id and the caller, so the three run
   * concurrently once the course is known. The most common caller — an
   * authenticated visitor with no relationship to the course, who ends at
   * PUBLIC — used to pay all four in series, inside the guard, before the
   * handler had done any work. The priority order is applied to the
   * results, not to the queries, so a KOSK_MANAGER now issues two lookups
   * it would have skipped; they run in parallel on the pool, which is the
   * cheaper trade.
   *
   * The MADRASAH_NAZIR path lands once the kosk→madrasah FK exists.
   */
  private async resolveCourseRole(
    userId: string,
    resource: ResourceRef
  ): Promise<Role | null> {
    if (!UUID_REGEX.test(resource.id)) return ROLES.PUBLIC;

    const koskId = await this.courseRepo.findKoskId(resource.id);
    if (koskId === null) return ROLES.PUBLIC;

    const [parentOwnerId, isMuderris, enrollment] = await Promise.all([
      this.koskRepo.findOwnerId(koskId),
      this.courseRepo.isMuderris(resource.id, userId),
      this.courseRepo.findEnrollment(userId, resource.id),
    ]);

    if (parentOwnerId === userId) return ROLES.KOSK_MANAGER;
    if (isMuderris) return ROLES.MUDERRIS;
    if (enrollment?.status === EnrollmentStatus.PENDING) return ROLES.PENDING;
    if (enrollment) return ROLES.ENROLLED; // ENROLLED or COMPLETED
    return ROLES.PUBLIC;
  }
}
