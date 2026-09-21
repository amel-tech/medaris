import { ENTITIES, ROLES } from "@medaris/common";
import { TedrisatRoleResolver } from "../../../src/authz/tedrisat-role-resolver.service";
import { CourseRepository } from "../../../src/course/course.repository";
import { EnrollmentStatus } from "../../../src/course/domain/enrollment-status.enum";
import { CourseNotFoundError } from "../../../src/course/errors/course-not-found.error";
import { DeckNotFoundError } from "../../../src/flashcard/errors/deck-not-found.error";
import { FlashcardDeckService } from "../../../src/flashcard/flashcard-deck.service";
import { KoskNotFoundError } from "../../../src/kosk/errors/kosk-not-found.error";
import { KoskService } from "../../../src/kosk/kosk.service";

interface DeckRow {
  id: string;
  isPublic: boolean;
  authorId: string;
}
interface EnrollmentRow {
  status: EnrollmentStatus;
}

/**
 * The resolver reads through `KoskService`, `FlashcardDeckService` and
 * `CourseRepository` (never through `DatabaseService`), so the stubs are
 * those methods. `koskOwnerId` drives BOTH stubs: `findOwnerId`, which the
 * direct köşk path uses because it has to tell "no such köşk" from "not your
 * köşk", and `isOwner`, which the course path's parent-köşk lookup still
 * uses because there a missing köşk cannot happen — the FK guarantees it.
 * `null` therefore means "no such köşk" to the first and "not the owner" to
 * the second, which is exactly the distinction MDRS-43 needed.
 */
interface Stubs {
  deck?: DeckRow | null;
  koskOwnerId?: string | null;
  courseKoskId?: string | null;
  muderris?: boolean;
  enrollment?: EnrollmentRow | null;
}

const build = (s: Stubs = {}) => {
  const kosk = {
    findOwnerId: vi.fn().mockResolvedValue(s.koskOwnerId ?? null),
    isOwner: vi
      .fn()
      .mockImplementation(
        async (_koskId: string, userId: string) =>
          s.koskOwnerId != null && s.koskOwnerId === userId
      ),
  } as unknown as KoskService;
  const course = {
    findKoskId: vi.fn().mockResolvedValue(s.courseKoskId ?? null),
    isMuderris: vi.fn().mockResolvedValue(s.muderris ?? false),
    findEnrollment: vi.fn().mockResolvedValue(s.enrollment ?? null),
  } as unknown as CourseRepository;
  const deck = {
    // `findVisibility`, not `findById`: the resolver reads exactly `authorId`
    // and `isPublic`, and runs inside the guard on every deck request.
    findVisibility: vi.fn().mockResolvedValue(s.deck ?? null),
  } as unknown as FlashcardDeckService;
  return {
    resolver: new TedrisatRoleResolver(kosk, course, deck),
    kosk,
    course,
    deck,
  };
};

const REAL_UUID = "11111111-1111-1111-1111-111111111111";
const OTHER_UUID = "22222222-2222-2222-2222-222222222222";
const KOSK_UUID = "33333333-3333-3333-3333-333333333333";

describe("TedrisatRoleResolver", () => {
  describe("flashcard-deck dispatch", () => {
    it("returns DECK_OWNER when caller authored a private deck", async () => {
      const { resolver } = build({
        deck: { id: REAL_UUID, isPublic: false, authorId: "owner-1" },
      });
      await expect(
        resolver.resolve("owner-1", {
          entity: ENTITIES.FLASHCARD_DECK,
          id: REAL_UUID,
        })
      ).resolves.toBe(ROLES.DECK_OWNER);
    });

    it("returns DECK_OWNER for the author of a PUBLIC deck — ownership beats visibility", async () => {
      // `isPublic` is a user-settable flag on a user-authored row. Testing it
      // first demoted the author to PUBLIC and locked them out of every
      // owner scope on their own deck.
      const { resolver } = build({
        deck: { id: REAL_UUID, isPublic: true, authorId: "owner-1" },
      });
      await expect(
        resolver.resolve("owner-1", {
          entity: ENTITIES.FLASHCARD_DECK,
          id: REAL_UUID,
        })
      ).resolves.toBe(ROLES.DECK_OWNER);
    });

    it("returns null (strict deny) for a stranger on a private deck", async () => {
      const { resolver } = build({
        deck: { id: REAL_UUID, isPublic: false, authorId: "owner-1" },
      });
      await expect(
        resolver.resolve("stranger", {
          entity: ENTITIES.FLASHCARD_DECK,
          id: REAL_UUID,
        })
      ).resolves.toBeNull();
    });

    it("returns PUBLIC for a stranger on a public deck", async () => {
      const { resolver } = build({
        deck: { id: REAL_UUID, isPublic: true, authorId: "admin" },
      });
      await expect(
        resolver.resolve("anyone", {
          entity: ENTITIES.FLASHCARD_DECK,
          id: REAL_UUID,
        })
      ).resolves.toBe(ROLES.PUBLIC);
    });

    // MDRS-43. This branch used to answer PUBLIC and leave the 404 to the
    // handler. With `@Authz` the guard decides FIRST, so on a write route the
    // handler that would have 404'd is never reached and "absent" came back as
    // the same 403 as "forbidden" — collapsing a distinction MDRS-56/63 made
    // deliberately. The 404 moved into the resolver with the decision.
    it("404s when the deck does not exist, rather than denying", async () => {
      const { resolver } = build({ deck: null });
      await expect(
        resolver.resolve("u", {
          entity: ENTITIES.FLASHCARD_DECK,
          id: OTHER_UUID,
        })
      ).rejects.toThrow(DeckNotFoundError);
    });

    it("returns PUBLIC for non-UUID deck ids without touching the repository", async () => {
      const { resolver, deck } = build();
      await expect(
        resolver.resolve("u", { entity: ENTITIES.FLASHCARD_DECK, id: "new" })
      ).resolves.toBe(ROLES.PUBLIC);
      expect(deck.findVisibility).not.toHaveBeenCalled();
    });
  });

  describe("kosk dispatch", () => {
    it("returns KOSK_MANAGER when caller owns the köşk", async () => {
      const { resolver } = build({ koskOwnerId: "manager-1" });
      await expect(
        resolver.resolve("manager-1", { entity: ENTITIES.KOSK, id: REAL_UUID })
      ).resolves.toBe(ROLES.KOSK_MANAGER);
    });

    it("returns PUBLIC for any non-owner on an existing köşk", async () => {
      const { resolver } = build({ koskOwnerId: "manager-1" });
      await expect(
        resolver.resolve("stranger", { entity: ENTITIES.KOSK, id: REAL_UUID })
      ).resolves.toBe(ROLES.PUBLIC);
    });

    it("404s when the köşk does not exist, rather than denying", async () => {
      const { resolver } = build({ koskOwnerId: null });
      await expect(
        resolver.resolve("u", { entity: ENTITIES.KOSK, id: OTHER_UUID })
      ).rejects.toThrow(KoskNotFoundError);
    });

    it("returns PUBLIC for non-UUID köşk ids", async () => {
      const { resolver, kosk } = build();
      await expect(
        resolver.resolve("u", { entity: ENTITIES.KOSK, id: "new" })
      ).resolves.toBe(ROLES.PUBLIC);
      expect(kosk.findOwnerId).not.toHaveBeenCalled();
    });
  });

  describe("course dispatch (priority: kosk_manager > muderris > enrolled > pending > public)", () => {
    it("returns KOSK_MANAGER when caller owns the parent köşk", async () => {
      const { resolver } = build({
        courseKoskId: KOSK_UUID,
        koskOwnerId: "manager-1",
      });
      await expect(
        resolver.resolve("manager-1", {
          entity: ENTITIES.COURSE,
          id: REAL_UUID,
        })
      ).resolves.toBe(ROLES.KOSK_MANAGER);
    });

    it("prefers KOSK_MANAGER over a muderris row and an enrollment for the same caller", async () => {
      const { resolver } = build({
        courseKoskId: KOSK_UUID,
        koskOwnerId: "manager-1",
        muderris: true,
        enrollment: { status: EnrollmentStatus.PENDING },
      });
      await expect(
        resolver.resolve("manager-1", {
          entity: ENTITIES.COURSE,
          id: REAL_UUID,
        })
      ).resolves.toBe(ROLES.KOSK_MANAGER);
    });

    it("returns MUDERRIS when caller is listed in course_muderris", async () => {
      const { resolver } = build({
        courseKoskId: KOSK_UUID,
        koskOwnerId: "someone-else",
        muderris: true,
      });
      await expect(
        resolver.resolve("teacher-1", {
          entity: ENTITIES.COURSE,
          id: REAL_UUID,
        })
      ).resolves.toBe(ROLES.MUDERRIS);
    });

    it("returns ENROLLED when caller has an ENROLLED enrollment", async () => {
      const { resolver } = build({
        courseKoskId: KOSK_UUID,
        koskOwnerId: "someone-else",
        enrollment: { status: EnrollmentStatus.ENROLLED },
      });
      await expect(
        resolver.resolve("talebe-1", {
          entity: ENTITIES.COURSE,
          id: REAL_UUID,
        })
      ).resolves.toBe(ROLES.ENROLLED);
    });

    it("returns PENDING when caller has a PENDING enrollment", async () => {
      const { resolver } = build({
        courseKoskId: KOSK_UUID,
        koskOwnerId: "someone-else",
        enrollment: { status: EnrollmentStatus.PENDING },
      });
      await expect(
        resolver.resolve("talebe-pending", {
          entity: ENTITIES.COURSE,
          id: REAL_UUID,
        })
      ).resolves.toBe(ROLES.PENDING);
    });

    it("returns PUBLIC for a stranger with no relationship to the course", async () => {
      const { resolver } = build({
        courseKoskId: KOSK_UUID,
        koskOwnerId: "someone-else",
      });
      await expect(
        resolver.resolve("stranger", {
          entity: ENTITIES.COURSE,
          id: REAL_UUID,
        })
      ).resolves.toBe(ROLES.PUBLIC);
    });

    it("issues the three dependent lookups once each, after the course row", async () => {
      const { resolver, kosk, course } = build({
        courseKoskId: KOSK_UUID,
        koskOwnerId: "someone-else",
      });
      await resolver.resolve("stranger", {
        entity: ENTITIES.COURSE,
        id: REAL_UUID,
      });
      expect(course.findKoskId).toHaveBeenCalledWith(REAL_UUID);
      expect(kosk.isOwner).toHaveBeenCalledTimes(1);
      expect(kosk.isOwner).toHaveBeenCalledWith(KOSK_UUID, "stranger");
      expect(course.isMuderris).toHaveBeenCalledWith(REAL_UUID, "stranger");
      expect(course.findEnrollment).toHaveBeenCalledWith("stranger", REAL_UUID);
    });

    it("404s when the course does not exist, without the dependent lookups", async () => {
      const { resolver, kosk, course } = build({ courseKoskId: null });
      await expect(
        resolver.resolve("u", { entity: ENTITIES.COURSE, id: OTHER_UUID })
      ).rejects.toThrow(CourseNotFoundError);
      expect(kosk.isOwner).not.toHaveBeenCalled();
      expect(course.isMuderris).not.toHaveBeenCalled();
      expect(course.findEnrollment).not.toHaveBeenCalled();
    });
  });

  describe("entities without DB-backed role yet", () => {
    it.each([
      ENTITIES.MADRASAH,
      ENTITIES.IJAZAH,
    ] as const)("returns PUBLIC for %s (provisional until tables land)", async (entity) => {
      const { resolver } = build();
      await expect(
        resolver.resolve("u", { entity, id: REAL_UUID })
      ).resolves.toBe(ROLES.PUBLIC);
    });
  });
});
