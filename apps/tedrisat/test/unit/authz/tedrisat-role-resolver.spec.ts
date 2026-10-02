import { ENTITIES, ROLES } from "@medaris/common";
import { TedrisatRoleResolver } from "../../../src/authz/tedrisat-role-resolver.service";
import { CourseRepository } from "../../../src/course/course.repository";
import { EnrollmentStatus } from "../../../src/course/domain/enrollment-status.enum";
import { FlashcardDeckService } from "../../../src/flashcard/flashcard-deck.service";
import { KoskService } from "../../../src/kosk/kosk.service";
import { MadrasahService } from "../../../src/madrasah/madrasah.service";

interface DeckRow {
  id: string;
  isPublic: boolean;
  authorId: string;
}
interface EnrollmentRow {
  status: EnrollmentStatus;
}

/**
 * The resolver reads through `KoskService.isOwner`, `FlashcardDeckService`
 * and `CourseRepository` (never through `DatabaseService`), so the stubs are
 * those methods. `koskOwnerId` drives `isOwner` for both the direct köşk
 * lookup and the parent köşk lookup on the course path — each resolution
 * makes exactly one.
 */
interface Stubs {
  deck?: DeckRow | null;
  koskOwnerId?: string | null;
  courseKoskId?: string | null;
  muderris?: boolean;
  enrollment?: EnrollmentRow | null;
  /** Nazırs of the medrese under test (`isNazir`). */
  madrasahNazirs?: string[];
  /** Nazırs of the medrese the köşk under test is affiliated with. */
  koskNazirs?: string[];
}

const build = (s: Stubs = {}) => {
  const kosk = {
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
  const madrasah = {
    isNazir: vi
      .fn()
      .mockImplementation(async (_madrasahId: string, userId: string) =>
        (s.madrasahNazirs ?? []).includes(userId)
      ),
    isNazirOfKosk: vi
      .fn()
      .mockImplementation(async (_koskId: string, userId: string) =>
        (s.koskNazirs ?? []).includes(userId)
      ),
  } as unknown as MadrasahService;
  return {
    resolver: new TedrisatRoleResolver(kosk, course, deck, madrasah),
    kosk,
    course,
    deck,
    madrasah,
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

    it("returns PUBLIC when the deck does not exist", async () => {
      const { resolver } = build({ deck: null });
      await expect(
        resolver.resolve("u", {
          entity: ENTITIES.FLASHCARD_DECK,
          id: OTHER_UUID,
        })
      ).resolves.toBe(ROLES.PUBLIC);
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

    it("returns PUBLIC when the köşk does not exist", async () => {
      const { resolver } = build({ koskOwnerId: null });
      await expect(
        resolver.resolve("u", { entity: ENTITIES.KOSK, id: OTHER_UUID })
      ).resolves.toBe(ROLES.PUBLIC);
    });

    it("returns PUBLIC for non-UUID köşk ids", async () => {
      const { resolver, kosk, madrasah } = build();
      await expect(
        resolver.resolve("u", { entity: ENTITIES.KOSK, id: "new" })
      ).resolves.toBe(ROLES.PUBLIC);
      expect(kosk.isOwner).not.toHaveBeenCalled();
      expect(madrasah.isNazirOfKosk).not.toHaveBeenCalled();
    });

    // MDRS-106. Fails if the nazır branch in `resolveKoskRole` is removed:
    // the caller then falls through to PUBLIC.
    it("returns MADRASAH_NAZIR for a nazır of the köşk's medrese", async () => {
      const { resolver, madrasah } = build({
        koskOwnerId: "manager-1",
        koskNazirs: ["nazir-1"],
      });
      await expect(
        resolver.resolve("nazir-1", { entity: ENTITIES.KOSK, id: REAL_UUID })
      ).resolves.toBe(ROLES.MADRASAH_NAZIR);
      expect(madrasah.isNazirOfKosk).toHaveBeenCalledWith(REAL_UUID, "nazir-1");
    });

    it("prefers KOSK_MANAGER for an owner who is also a nazır of its medrese", async () => {
      const { resolver } = build({
        koskOwnerId: "both-1",
        koskNazirs: ["both-1"],
      });
      await expect(
        resolver.resolve("both-1", { entity: ENTITIES.KOSK, id: REAL_UUID })
      ).resolves.toBe(ROLES.KOSK_MANAGER);
    });
  });

  describe("madrasah dispatch (MDRS-106)", () => {
    // Fails if the nazır branch in `resolveMadrasahRole` is removed.
    it("returns MADRASAH_NAZIR for a user listed in madrasah_nazirs", async () => {
      const { resolver, madrasah } = build({ madrasahNazirs: ["nazir-1"] });
      await expect(
        resolver.resolve("nazir-1", {
          entity: ENTITIES.MADRASAH,
          id: REAL_UUID,
        })
      ).resolves.toBe(ROLES.MADRASAH_NAZIR);
      expect(madrasah.isNazir).toHaveBeenCalledWith(REAL_UUID, "nazir-1");
    });

    it("returns PUBLIC for anyone else, including on a missing medrese", async () => {
      const { resolver } = build({ madrasahNazirs: ["nazir-1"] });
      await expect(
        resolver.resolve("stranger", {
          entity: ENTITIES.MADRASAH,
          id: REAL_UUID,
        })
      ).resolves.toBe(ROLES.PUBLIC);
    });

    it("returns PUBLIC for non-UUID ids (list, create) without a lookup", async () => {
      const { resolver, madrasah } = build({ madrasahNazirs: ["nazir-1"] });
      await expect(
        resolver.resolve("nazir-1", { entity: ENTITIES.MADRASAH, id: "any" })
      ).resolves.toBe(ROLES.PUBLIC);
      expect(madrasah.isNazir).not.toHaveBeenCalled();
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

    it("never makes a nazır of the parent köşk's medrese more than PUBLIC on the course", async () => {
      const { resolver, madrasah } = build({
        courseKoskId: KOSK_UUID,
        koskOwnerId: "someone-else",
        koskNazirs: ["nazir-1"],
      });
      await expect(
        resolver.resolve("nazir-1", {
          entity: ENTITIES.COURSE,
          id: REAL_UUID,
        })
      ).resolves.toBe(ROLES.PUBLIC);
      expect(madrasah.isNazirOfKosk).not.toHaveBeenCalled();
    });

    it("returns PUBLIC when the course does not exist, without the dependent lookups", async () => {
      const { resolver, kosk, course } = build({ courseKoskId: null });
      await expect(
        resolver.resolve("u", { entity: ENTITIES.COURSE, id: OTHER_UUID })
      ).resolves.toBe(ROLES.PUBLIC);
      expect(kosk.isOwner).not.toHaveBeenCalled();
      expect(course.isMuderris).not.toHaveBeenCalled();
      expect(course.findEnrollment).not.toHaveBeenCalled();
    });
  });

  describe("entities without DB-backed role yet", () => {
    it("returns PUBLIC for ijazah (provisional until its tables land)", async () => {
      const { resolver } = build();
      await expect(
        resolver.resolve("u", { entity: ENTITIES.IJAZAH, id: REAL_UUID })
      ).resolves.toBe(ROLES.PUBLIC);
    });
  });
});
