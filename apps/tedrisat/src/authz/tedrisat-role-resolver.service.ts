import {
  AnonymousRelation,
  ENTITIES,
  PERMISSIONS,
  RELATIONS,
  Relation,
  ResourceClosure,
  ResourceRef,
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
 * Resolves what the caller is to a given resource — enrolled in it, waiting to
 * be, the author of it, or just any signed-in caller — by consulting the
 * domain's own tables, through the feature modules' services where one already
 * answers the question (`KoskService.exists`, `FlashcardDeckService.findVisibility`)
 * and through `CourseRepository` for the course lookups no service exposes,
 * never through `DatabaseService` directly.
 *
 * Since MDRS-135 it no longer resolves ROLES. The köşk nazımı, the başmüderris,
 * the müderris and the rest are `role_assignments` rows, and what they and
 * their grants allow is `AuthzService`'s computation over the scope chain
 * (`TedrisatAuthzContext`). A relationship adds to what a person holds there;
 * it never replaces it, so a müderris who is also enrolled in a sibling
 * course keeps both.
 *
 * A resource that is **not there** raises the module's own 404 from inside
 * the resolver (`DeckNotFoundError`, `KoskNotFoundError`,
 * `CourseNotFoundError`), which `AuthzGuard.resolveResource` propagates
 * untouched: the guard decides in FRONT of the handler, so a missing resource
 * on a write route must not collapse into the same 403 as "forbidden".
 * MDRS-56 and MDRS-63 decided this on purpose, and `flashcard-bulk.e2e.spec.ts`
 * pins it: ids are v4 UUIDs, so a 404 leaks nothing anyone could enumerate.
 *
 * Returning `null` means **deny** — no relationship applies and no public
 * access is intended. When a resource is meant to be open to any authenticated
 * caller (a public deck, a non-existent id on a create endpoint), the resolver
 * returns `RELATIONS.PUBLIC` explicitly.
 *
 * Wired entities: `flashcard-deck` (author), `kosk`, `course` (enrolled /
 * pending / public) and `madrasah`.
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

  async resolve(
    userId: string,
    resource: ResourceRef
  ): Promise<Relation | null> {
    switch (resource.entity) {
      case ENTITIES.FLASHCARD_DECK:
        return this.resolveDeckRole(userId, resource);
      case ENTITIES.KOSK:
        return this.resolveKoskRole(userId, resource);
      case ENTITIES.COURSE:
        return this.resolveCourseRole(userId, resource);
      case ENTITIES.MADRASAH:
        return this.resolveMadrasahRole(userId, resource);
      default:
        return null;
    }
  }

  /**
   * A course is shown only while its köşk is (MDRS-143): a hidden köşk closes
   * its courses, to the talebe enrolled in them and to a müderris or a
   * başmüderris too, and only the people above the courses still open them:
   * the köşk's nazımları (`course.hide` on the course by nesting), Medaris
   * yönetimi holding `platform.kosk_edit`, and the başnazım. A medrese is not
   * above a köşk. Read from the köşk's own state, not from a cascade, so a
   * course opened after the hide is closed as well and a restore reopens
   * exactly what the hide closed. `AuthzGuard` asks it in front of every
   * signed-in route on a course, so the closure is one rule, not one check per
   * route.
   */
  async closure(resource: ResourceRef): Promise<ResourceClosure | null> {
    if (resource.entity !== ENTITIES.COURSE || !UUID_REGEX.test(resource.id)) {
      return null;
    }
    if (!(await this.courseRepo.findHideState(resource.id))?.koskArchivedAt) {
      return null;
    }
    return {
      openTo: [PERMISSIONS.COURSE_HIDE, PERMISSIONS.PLATFORM_KOSK_EDIT],
      notFound: new CourseNotFoundError(resource.id),
    };
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
  async resolveAnonymous(
    resource: ResourceRef
  ): Promise<AnonymousRelation | null> {
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
   * - Köşk missing, unlisted (`is_private`) or hidden (MDRS-174):
   *   `KoskNotFoundError`. An unlisted köşk opens by its link to a signed-in
   *   caller only; without a token it is indistinguishable from one that
   *   does not exist, and a hidden one is that for everyone anonymous.
   * - Otherwise: ANONYMOUS.
   */
  private async resolveAnonymousKoskRole(
    resource: ResourceRef
  ): Promise<AnonymousRelation> {
    if (!UUID_REGEX.test(resource.id)) return RELATIONS.ANONYMOUS;

    const kosk = await this.koskService.findVisibility(resource.id);
    if (!kosk || kosk.isPrivate || kosk.hidden) {
      throw new KoskNotFoundError(resource.id);
    }
    return RELATIONS.ANONYMOUS;
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
  ): Promise<AnonymousRelation> {
    if (!UUID_REGEX.test(resource.id)) return RELATIONS.ANONYMOUS;

    const course = await this.courseRepo.findPublicVisibility(resource.id);
    if (
      !course ||
      course.status !== CourseStatus.PUBLISHED ||
      course.archived ||
      course.koskIsPrivate ||
      course.koskHidden
    ) {
      throw new CourseNotFoundError(resource.id);
    }
    return RELATIONS.ANONYMOUS;
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
  ): Promise<AnonymousRelation> {
    if (!UUID_REGEX.test(resource.id)) return RELATIONS.ANONYMOUS;

    if (!(await this.madrasahService.exists(resource.id))) {
      throw new MadrasahNotFoundError(resource.id);
    }
    return RELATIONS.ANONYMOUS;
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
  ): Promise<AnonymousRelation> {
    if (!UUID_REGEX.test(resource.id)) return RELATIONS.ANONYMOUS;

    const deck = await this.deckService.findVisibility(resource.id);
    if (!deck || !deck.isPublic) throw new DeckNotFoundError(resource.id);
    return RELATIONS.ANONYMOUS;
  }

  /**
   * Deck role dispatch. Schema realises two variants: `isPublic = false`
   * (private) and `isPublic = true` (global). Other variants from plan
   * §4.2 will land with their foreign keys.
   *
   * - Non-UUID id (the `forNew` sentinel, malformed input): return PUBLIC so
   *   `deck.create_private`, which any signed-in caller holds, applies. Defends
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
   *   `@Authz(deck.manage_private)`, a permission only DECK_OWNER holds, so
   *   nobody but the author can flip the flag — which is also what stops an
   *   attacker from turning this resolver's answer for every other caller
   *   from `null` (deny) into `RELATIONS.PUBLIC`. Weaken that permission and this
   *   priority order becomes unsound with it. (Before MDRS-43 the same
   *   invariant was held up by an `assertOwner` call in the handler.)
   * - Public deck, not the author: PUBLIC (any authenticated caller may view).
   * - Private deck shared through a course (`deckSharedWith`, MDRS-164), not
   *   the author: PUBLIC as well, which reads and collects it and writes
   *   nothing.
   * - Private deck, not the author: `DeckNotFoundError`, the same 404 as a
   *   deck that is not there — on every deck route, reads and writes alike.
   *   A 403 here told a stranger the UUID was somebody's private deck;
   *   MDRS-43 AC-4 requires that "private" and "absent" look the same. The
   *   403 is kept for what the caller can already see: a public deck they
   *   do not own, whose owner permissions the engine denies.
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
  ): Promise<Relation> {
    if (!UUID_REGEX.test(resource.id)) return RELATIONS.PUBLIC;

    const deck = await this.deckService.findVisibility(resource.id, userId);
    if (!deck) throw new DeckNotFoundError(resource.id);
    if (deck.authorId === userId) return RELATIONS.DECK_OWNER;
    // A deck that belongs to a course the caller is enrolled in (MDRS-164) is
    // read like a public one: PUBLIC holds VIEW and nothing that writes.
    if (!deck.isPublic && !deck.sharedWithViewer) {
      throw new DeckNotFoundError(resource.id);
    }
    return RELATIONS.PUBLIC;
  }

  /**
   * Köşk relationship.
   *
   * - Non-UUID id ("new" sentinel, malformed input): PUBLIC. Creating a köşk
   *   is `platform.kosk_create`, which no relationship holds (see
   *   relations.ts): the başnazım passes by the realm bypass and a Medaris
   *   nazımı by that grant.
   * - Köşk missing: `KoskNotFoundError` (MDRS-43). Mirrors the deck branch.
   * - Otherwise: PUBLIC. What a köşk nazımı may do is not a relationship: it
   *   is the KOSK_NAZIM role's defaults, read from `role_assignments`.
   */
  private async resolveKoskRole(
    _userId: string,
    resource: ResourceRef
  ): Promise<Relation | null> {
    if (!UUID_REGEX.test(resource.id)) return RELATIONS.PUBLIC;

    if (!(await this.koskService.exists(resource.id))) {
      throw new KoskNotFoundError(resource.id);
    }
    return RELATIONS.PUBLIC;
  }

  /**
   * Medrese relationship. Every caller is PUBLIC here, including on a medrese
   * that does not exist: the controller's resolver answers a missing medrese
   * with 404 first. The başmüderris and the nazırs are `role_assignments` and
   * `permission_grants`, not relationships (MDRS-135).
   */
  private async resolveMadrasahRole(
    _userId: string,
    _resource: ResourceRef
  ): Promise<Relation | null> {
    return RELATIONS.PUBLIC;
  }

  /**
   * Course relationship, from the caller's enrollment alone:
   *
   *   1. ENROLLED — an `ENROLLED` or `COMPLETED` enrollment
   *   2. PENDING  — a `PENDING` enrollment awaiting approval
   *   3. PUBLIC   — any authenticated caller (covers ENROLL on a course that
   *                 exists), and what a barred or removed talebe falls back to
   *
   * Whoever runs the course (the köşk's nazımı, the müderris, a başmüderris
   * whose medrese holds it, anyone granted something there) is not decided
   * here: `AuthzService` adds what their roles and grants allow along the
   * scope chain, and a person who is both enrolled and staff holds both.
   *
   * Two round trips, not three: `findKoskId` doubles as the existence check
   * (the FK to `kosks` is not nullable, so it is null only for an absent
   * course), then the enrollment is read.
   */
  private async resolveCourseRole(
    userId: string,
    resource: ResourceRef
  ): Promise<Relation | null> {
    if (!UUID_REGEX.test(resource.id)) return RELATIONS.PUBLIC;

    const koskId = await this.courseRepo.findKoskId(resource.id);
    if (koskId === null) throw new CourseNotFoundError(resource.id);

    const enrollment = await this.courseRepo.findEnrollment(
      userId,
      resource.id
    );
    // A barred talebe is a stranger to the course (MDRS-177): they keep the
    // public page and lose what only the enrolled hold. It asks the
    // repository, not `BanService`: the service needs `AuthzService`, which
    // needs this resolver, and that cycle never resolves.
    if (
      enrollment &&
      (await this.banRepo.isBarredFromCourse(userId, resource.id))
    ) {
      return RELATIONS.PUBLIC;
    }
    // A talebe the course team took out keeps the public page too (MDRS-161).
    if (enrollment?.status === EnrollmentStatus.REVOKED) {
      return RELATIONS.PUBLIC;
    }
    if (enrollment?.status === EnrollmentStatus.PENDING) {
      return RELATIONS.PENDING;
    }
    if (enrollment) return RELATIONS.ENROLLED; // ENROLLED or COMPLETED
    return RELATIONS.PUBLIC;
  }
}
