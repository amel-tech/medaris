import {
  AnonymousRole,
  ENTITIES,
  ResourceRef,
  ROLES,
  Role,
  RoleResolver,
} from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { BanRepository } from "../ban/ban.repository";
import { CourseRepository } from "../course/course.repository";
import { CourseStatus } from "../course/domain/course-status.enum";
import { EnrollmentStatus } from "../course/domain/enrollment-status.enum";
import { CourseNotFoundError } from "../course/errors/course-not-found.error";
import { DeckNotFoundError } from "../flashcard/errors/deck-not-found.error";
import { FlashcardDeckService } from "../flashcard/flashcard-deck.service";
import { KoskNotFoundError } from "../kosk/errors/kosk-not-found.error";
import { KoskService } from "../kosk/kosk.service";
import { MadrasahNotFoundError } from "../madrasah/errors/madrasah-not-found.error";
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
 * A resource that is **not there** raises the module's own 404 from inside
 * the resolver (`DeckNotFoundError`, `KoskNotFoundError`,
 * `CourseNotFoundError`), which `AuthzGuard.resolveResource` propagates
 * untouched. Before MDRS-43 these branches answered `ROLES.PUBLIC` and left
 * the 404 to the handler, on the grounds that the resolver should not leak
 * existence — but once the guard decides in FRONT of the handler, a missing
 * resource on a write route never reaches the code that would 404 it, and
 * "absent" collapsed into the same 403 as "forbidden". MDRS-56 and MDRS-63
 * decided the opposite on purpose, and `flashcard-bulk.e2e.spec.ts` pins it:
 * ids here are v4 UUIDs, so 404 leaks nothing anyone could enumerate, while
 * folding it into 403 makes a mistyped id indistinguishable from a real
 * permission problem. So the 404 moves forward with the decision.
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
    private readonly madrasahService: MadrasahService,
    private readonly banRepo: BanRepository
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
   * The caller with no token (MDRS-45). Only reached for an `@AuthzPublic()`
   * handler. Decks (MDRS-45) and the köşk, medrese and course pages
   * (MDRS-122) are opened here; ijazah and anything else answer `null` and
   * the guard refuses.
   *
   * Every branch answers a resource the anonymous caller may not see with the
   * module's own 404 — the same code and message as a resource that is not
   * there — so a guessed id tells them nothing about what exists.
   */
  async resolveAnonymous(resource: ResourceRef): Promise<AnonymousRole | null> {
    switch (resource.entity) {
      case ENTITIES.FLASHCARD_DECK:
        return this.resolveAnonymousDeckRole(resource);
      case ENTITIES.KOSK:
        return this.resolveAnonymousKoskRole(resource);
      case ENTITIES.COURSE:
        return this.resolveAnonymousCourseRole(resource);
      case ENTITIES.MADRASAH:
        return this.resolveAnonymousMadrasahRole(resource);
      default:
        return null;
    }
  }

  /**
   * Köşk, for a caller with no token (MDRS-122).
   *
   * - Non-UUID id: ANONYMOUS, so `ParseUUIDPipe` gives everyone the same 400.
   *   Safe: the ANONYMOUS row holds VIEW alone.
   * - Köşk missing, or unlisted (`is_private`): `KoskNotFoundError`. An
   *   unlisted köşk opens by its link to a signed-in caller only; without a
   *   token it is indistinguishable from one that does not exist.
   * - Otherwise: ANONYMOUS.
   */
  private async resolveAnonymousKoskRole(
    resource: ResourceRef
  ): Promise<AnonymousRole> {
    if (!UUID_REGEX.test(resource.id)) return ROLES.ANONYMOUS;

    const kosk = await this.koskService.findVisibility(resource.id);
    if (!kosk || kosk.isPrivate) throw new KoskNotFoundError(resource.id);
    return ROLES.ANONYMOUS;
  }

  /**
   * Course, for a caller with no token (MDRS-122). The body they then get is
   * `CourseService.present`'s filtered one (MDRS-103's `withoutContent`):
   * ANONYMOUS holds no `VIEW_DETAILS`.
   *
   * - Non-UUID id: ANONYMOUS, for the pipe's 400.
   * - `CourseNotFoundError`, one answer for all of: no such course; a DRAFT;
   *   a hidden (archived) course; any course of an unlisted köşk. A signed-in
   *   stranger already gets 404 for the first three (`getDetail`); the
   *   fourth is the köşk's own rule carried down to its courses, so a course
   *   link does not open what the köşk link would not.
   * - Otherwise: ANONYMOUS.
   */
  private async resolveAnonymousCourseRole(
    resource: ResourceRef
  ): Promise<AnonymousRole> {
    if (!UUID_REGEX.test(resource.id)) return ROLES.ANONYMOUS;

    const course = await this.courseRepo.findPublicVisibility(resource.id);
    if (
      !course ||
      course.status !== CourseStatus.PUBLISHED ||
      course.archived ||
      course.koskIsPrivate
    ) {
      throw new CourseNotFoundError(resource.id);
    }
    return ROLES.ANONYMOUS;
  }

  /**
   * Medrese, for a caller with no token (MDRS-122). A medrese has no
   * unlisted or passive state, so it is open once it exists.
   *
   * - Non-UUID id: ANONYMOUS — the list route's `any` sentinel, and the
   *   pipe's 400 for a malformed id.
   * - Medrese missing: `MadrasahNotFoundError`. The controller's
   *   `byExistingMadrasah` answers that first; this keeps the resolver from
   *   depending on it.
   */
  private async resolveAnonymousMadrasahRole(
    resource: ResourceRef
  ): Promise<AnonymousRole> {
    if (!UUID_REGEX.test(resource.id)) return ROLES.ANONYMOUS;

    if (!(await this.madrasahService.exists(resource.id))) {
      throw new MadrasahNotFoundError(resource.id);
    }
    return ROLES.ANONYMOUS;
  }

  /**
   * The anonymous half of `resolveDeckRole`, with the same answers where the
   * two overlap, so an anonymous visitor learns no more than a stranger with a
   * token does:
   *
   * - Non-UUID id: ANONYMOUS, as the authenticated branch answers PUBLIC —
   *   the handler's `ParseUUIDPipe` then gives the 400 it gives everyone.
   *   Safe because the ANONYMOUS row holds VIEW alone; no create scope can
   *   ride the `forNew` sentinel through here.
   * - Deck missing, or private: `DeckNotFoundError`, the same 404 for both
   *   (MDRS-45 AC-2, as MDRS-43 AC-4 is for a stranger). There is no author
   *   to compare against, so a private deck is never readable here.
   * - Public deck: ANONYMOUS.
   */
  private async resolveAnonymousDeckRole(
    resource: ResourceRef
  ): Promise<AnonymousRole> {
    if (!UUID_REGEX.test(resource.id)) return ROLES.ANONYMOUS;

    const deck = await this.deckService.findVisibility(resource.id);
    if (!deck || !deck.isPublic) throw new DeckNotFoundError(resource.id);
    return ROLES.ANONYMOUS;
  }

  /**
   * Deck role dispatch. Schema realises two variants: `isPublic = false`
   * (private) and `isPublic = true` (global). Other variants from plan
   * §4.2 will land with their foreign keys.
   *
   * - Non-UUID id (the `forNew` sentinel, malformed input): return PUBLIC so
   *   `CREATE_PRIVATE_DECK` on the matrix's PUBLIC row applies. Defends
   *   against Postgres 22P02. This branch must stay AHEAD of the existence
   *   check — a create endpoint names no deck and must not 404.
   * - Deck missing: `DeckNotFoundError`. See the class comment: the guard
   *   now runs in front of the handler that used to raise this.
   * - Caller authored the deck: DECK_OWNER — checked BEFORE `isPublic`.
   *   `isPublic` is a user-settable visibility flag on a user-authored
   *   row, not an admin flag; testing it first turned the author of a
   *   public deck into PUBLIC and locked them out of every owner scope on
   *   their own deck, with no way back since flipping the flag is itself
   *   owner-scoped (review finding on MDRS-41). That last clause is an
   *   invariant of `FlashcardDeckController`, not of the schema: `PATCH`
   *   and `PUT /flashcard/decks/:id` are both
   *   `@Authz(MANAGE_PRIVATE_DECK)`, a scope only DECK_OWNER carries, so
   *   nobody but the author can flip the flag — which is also what stops an
   *   attacker from turning this resolver's answer for every other caller
   *   from `null` (deny) into `ROLES.PUBLIC`. Weaken that scope and this
   *   priority order becomes unsound with it. (Before MDRS-43 the same
   *   invariant was held up by an `assertOwner` call in the handler.)
   * - Public deck, not the author: PUBLIC (any authenticated caller may view).
   * - Private deck, not the author: `DeckNotFoundError`, the same 404 as a
   *   deck that is not there — on every deck route, reads and writes alike.
   *   A 403 here told a stranger the UUID was somebody's private deck;
   *   MDRS-43 AC-4 requires that "private" and "absent" look the same. The
   *   403 is kept for what the caller can already see: a public deck they
   *   do not own, whose owner scopes the matrix denies.
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
  ): Promise<Role> {
    if (!UUID_REGEX.test(resource.id)) return ROLES.PUBLIC;

    const deck = await this.deckService.findVisibility(resource.id);
    if (!deck) throw new DeckNotFoundError(resource.id);
    if (deck.authorId === userId) return ROLES.DECK_OWNER;
    if (!deck.isPublic) throw new DeckNotFoundError(resource.id);
    return ROLES.PUBLIC;
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
   * - Köşk missing: `KoskNotFoundError` (MDRS-43). Mirrors the deck branch
   *   above.
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
    // (KOSK_NAZIM, MDRS-134), and it answers `false` for a missing köşk
    // as well as for a non-manager. Those are a 404 and a 403 respectively
    // (MDRS-43), so existence is read alongside it rather than folded in.
    const [exists, isManager] = await Promise.all([
      this.koskService.exists(resource.id),
      this.koskService.isManager(resource.id, userId),
    ]);
    if (!exists) throw new KoskNotFoundError(resource.id);
    return isManager ? ROLES.KOSK_MANAGER : ROLES.PUBLIC;
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

    // `findKoskId` is null only when the course row is absent — the FK to
    // `kosks` is not nullable — so this doubles as the existence check.
    const koskId = await this.courseRepo.findKoskId(resource.id);
    if (koskId === null) throw new CourseNotFoundError(resource.id);

    const [ownsParentKosk, isMuderris, enrollment] = await Promise.all([
      this.koskService.isManager(koskId, userId),
      this.courseRepo.isMuderris(resource.id, userId),
      this.courseRepo.findEnrollment(userId, resource.id),
    ]);

    if (ownsParentKosk) return ROLES.KOSK_MANAGER;
    if (isMuderris) return ROLES.MUDERRIS;
    // A barred talebe is a stranger to the course (MDRS-177): they keep the
    // public page and lose what only the enrolled hold. Staff are never
    // barred (`BanService.create` refuses it), so this sits after them. It
    // asks the repository, not `BanService`: the service needs `AuthzService`,
    // which needs this resolver, and that cycle never resolves.
    if (
      enrollment &&
      (await this.banRepo.isBarredFromCourse(userId, resource.id))
    ) {
      return ROLES.PUBLIC;
    }
    if (enrollment?.status === EnrollmentStatus.PENDING) return ROLES.PENDING;
    if (enrollment) return ROLES.ENROLLED; // ENROLLED or COMPLETED
    return ROLES.PUBLIC;
  }
}
