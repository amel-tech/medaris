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
import { FlashcardDeckService } from "../flashcard/flashcard-deck.service";
import { KoskService } from "../kosk/kosk.service";
import { MadrasahService } from "../madrasah/madrasah.service";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves the caller's role on a given resource by consulting the
 * domain's ownership/enrollment tables — through the feature modules'
 * services where one already answers the question (`KoskService.isManager`,
 * `FlashcardDeckService.findVisibility`) and through `CourseRepository` for
 * the course lookups no service exposes, never through `DatabaseService`
 * directly. Authorization and the domain code therefore read ownership from
 * one code path: when the rule or the storage shape changes (a membership
 * table for köşk ownership, say), the one owner changes and both readers
 * follow.
 *
 * Returning `null` means **deny** — the caller has no role on this
 * resource and no public access is intended either. `AuthzService.can`
 * treats null as a hard deny (no `PUBLIC` fallback), so when a resource
 * is meant to be open to any authenticated caller (a public deck, a
 * non-existent ID on a create endpoint, the donate scope on a
 * madrasah), the resolver must explicitly return `ROLES.PUBLIC`.
 *
 * Wired entities so far: `flashcard-deck` (owner), `kosk` (manager),
 * `course` (manager / muderris / enrolled / pending), `madrasah` (nazır,
 * MDRS-106). Since MDRS-134 the manager, müderris and nazır answers come
 * from `role_assignments` (KOSK_NAZIM, MUDERRIS, MEDRESE_BASMUDERRIS), read
 * through the same services. `ijazah` returns `PUBLIC` provisionally; its
 * restricted scopes deny because PUBLIC does not list them.
 *
 * Priority rules for multi-role situations:
 *   - KOSK_MANAGER > MUDERRIS > ENROLLED > PENDING
 *   - A medrese's nazır gets nothing on a köşk or a course from being one:
 *     neither path consults the medrese (MDRS-133 — medreses never moderate
 *     köşks; MDRS-134 removed the köşk affiliation that once did).
 *   - SYSTEM_ADMIN bypass is handled upstream in `AuthzService.isSystemAdmin`,
 *     not here.
 */
@Injectable()
export class TedrisatRoleResolver implements RoleResolver {
  constructor(
    private readonly koskService: KoskService,
    private readonly courseRepo: CourseRepository,
    private readonly deckService: FlashcardDeckService,
    private readonly madrasahService: MadrasahService
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
        return this.resolveMadrasahRole(userId, resource);
      case ENTITIES.IJAZAH:
        // TODO(authz): wire the ijazah tables as they land. Until then,
        // restricted scopes are denied because PUBLIC does not list them.
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
   *   owner-scoped (review finding on MDRS-41). That last clause is an
   *   invariant of `FlashcardDeckController`, not of the schema: `PATCH`
   *   and `PUT /flashcard/decks/:id` both call `assertOwner` before
   *   `update`, so nobody but the author can flip the flag — which is also
   *   what stops an attacker from turning this resolver's answer for every
   *   other caller from `null` (deny) into `ROLES.PUBLIC`. Remove that
   *   assertion and this priority order becomes unsound with it.
   * - Public deck, not the author: PUBLIC (any authenticated caller may view).
   * - Private deck, not the author: null → strict deny.
   *
   * Two columns, one row, LIMIT 1 — `findVisibility`, not `findById`. This
   * runs inside the guard on every deck request, before the handler has done
   * any work, and `findById` returns every column of `decks` (including the
   * unbounded `description` text) to answer a question that reads exactly
   * `authorId` and `isPublic`.
   */
  private async resolveDeckRole(
    userId: string,
    resource: ResourceRef
  ): Promise<Role | null> {
    if (!UUID_REGEX.test(resource.id)) return ROLES.PUBLIC;

    const deck = await this.deckService.findVisibility(resource.id);
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
   * - Caller is one of the köşk's managers: KOSK_MANAGER.
   * - Otherwise: PUBLIC. Anyone authenticated may VIEW; EDIT/DELETE
   *   are not on the PUBLIC row so non-owners are denied.
   *
   * There is no MADRASAH_NAZIR path any more (MDRS-134): a medrese's only
   * link to a köşk is a hosting right, which gives it no power over the
   * köşk (MDRS-133).
   */
  private async resolveKoskRole(
    userId: string,
    resource: ResourceRef
  ): Promise<Role | null> {
    if (!UUID_REGEX.test(resource.id)) return ROLES.PUBLIC;

    // `KoskService.isManager` is the module's one management predicate
    // (KOSK_NAZIM, MDRS-134); a missing köşk is simply "not a manager",
    // which is PUBLIC here too.
    return (await this.koskService.isManager(resource.id, userId))
      ? ROLES.KOSK_MANAGER
      : ROLES.PUBLIC;
  }

  /**
   * Medrese role dispatch (MDRS-106).
   *
   * - Non-UUID id (the list and create routes): PUBLIC — VIEW and DONATE.
   *   `CREATE_MADRASAH` is on no row, so creating stays SYSTEM_ADMIN's.
   * - Caller holds MEDRESE_BASMUDERRIS there (MDRS-134): MADRASAH_NAZIR.
   * - Otherwise, including a medrese that does not exist: PUBLIC. The
   *   controller's resolver answers a missing medrese with 404 first.
   */
  private async resolveMadrasahRole(
    userId: string,
    resource: ResourceRef
  ): Promise<Role | null> {
    if (!UUID_REGEX.test(resource.id)) return ROLES.PUBLIC;

    return (await this.madrasahService.isNazir(resource.id, userId))
      ? ROLES.MADRASAH_NAZIR
      : ROLES.PUBLIC;
  }

  /**
   * Course role dispatch.
   *
   * Priority (highest first):
   *   1. KOSK_MANAGER — caller manages the course's parent köşk
   *   2. MUDERRIS     — caller holds MUDERRIS on this course (MDRS-134)
   *   3. ENROLLED     — caller has an `ENROLLED` (or `COMPLETED`) enrollment
   *   4. PENDING      — caller has a `PENDING` enrollment awaiting approval
   *   5. PUBLIC       — any authenticated caller (covers ENROLL on a course
   *                     that exists)
   *
   * Two round trips, not four: only the parent-köşk lookup depends on the
   * course row (it needs `koskId`); the muderris and enrollment lookups
   * need nothing but the course id and the caller, so the three run
   * concurrently once the course is known. It could be one hop with a
   * courses⋈kosks join, but that would re-implement köşk ownership beside
   * `KoskService.isManager` — one owner of that predicate was judged worth
   * the extra hop; revisit if the guard shows up in a profile. The most common caller — an
   * authenticated visitor with no relationship to the course, who ends at
   * PUBLIC — used to pay all four in series, inside the guard, before the
   * handler had done any work. The priority order is applied to the
   * results, not to the queries, so a KOSK_MANAGER now issues two lookups
   * it would have skipped; they run in parallel on the pool, which is the
   * cheaper trade.
   *
   * There is deliberately no MADRASAH_NAZIR path: a medrese's nazır has no
   * direct authority over a course (PRD §4.1). MDRS-135 replaces this with
   * the permission catalogue, where a başmüderris reaches the medrese's
   * courses through `courses.madrasah_id`.
   */
  private async resolveCourseRole(
    userId: string,
    resource: ResourceRef
  ): Promise<Role | null> {
    if (!UUID_REGEX.test(resource.id)) return ROLES.PUBLIC;

    const koskId = await this.courseRepo.findKoskId(resource.id);
    if (koskId === null) return ROLES.PUBLIC;

    const [ownsParentKosk, isMuderris, enrollment] = await Promise.all([
      this.koskService.isManager(koskId, userId),
      this.courseRepo.isMuderris(resource.id, userId),
      this.courseRepo.findEnrollment(userId, resource.id),
    ]);

    if (ownsParentKosk) return ROLES.KOSK_MANAGER;
    if (isMuderris) return ROLES.MUDERRIS;
    if (enrollment?.status === EnrollmentStatus.PENDING) return ROLES.PENDING;
    if (enrollment) return ROLES.ENROLLED; // ENROLLED or COMPLETED
    return ROLES.PUBLIC;
  }
}
