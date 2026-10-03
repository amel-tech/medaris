import { ENTITIES, RELATIONS } from "@medaris/common";
import { TedrisatRoleResolver } from "../../../src/authz/tedrisat-role-resolver.service";
import { BanRepository } from "../../../src/ban/ban.repository";
import { CourseRepository } from "../../../src/course/course.repository";
import { CourseStatus } from "../../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../../src/course/domain/enrollment-status.enum";
import { CourseNotFoundError } from "../../../src/course/errors/course-not-found.error";
import { DeckNotFoundError } from "../../../src/flashcard/errors/deck-not-found.error";
import { FlashcardDeckService } from "../../../src/flashcard/flashcard-deck.service";
import { KoskNotFoundError } from "../../../src/kosk/errors/kosk-not-found.error";
import { KoskService } from "../../../src/kosk/kosk.service";
import { MadrasahNotFoundError } from "../../../src/madrasah/errors/madrasah-not-found.error";
import { MadrasahService } from "../../../src/madrasah/madrasah.service";

interface DeckRow {
  id: string;
  isPublic: boolean;
  authorId: string;
  /** a course deck the asked-about caller is enrolled for (MDRS-164) */
  sharedWithViewer?: boolean;
}
interface EnrollmentRow {
  status: EnrollmentStatus;
}

/**
 * The resolver reads through `KoskService`, `FlashcardDeckService`,
 * `MadrasahService` and `CourseRepository` (never through `DatabaseService`),
 * so the stubs are those methods. `koskManagerId` drives `isManager` for both
 * the direct köşk lookup and the parent köşk lookup on the course path — each
 * resolution makes exactly one. `koskExists` (default true) drives `exists`,
 * which only the direct köşk path reads: it has to tell "no such köşk" (404)
 * from "not your köşk" (MDRS-43), while on the course path the FK already
 * guarantees the parent köşk is there.
 */
interface Stubs {
  deck?: DeckRow | null;
  koskManagerId?: string | null;
  /** Whether the köşk under test exists (`exists`); defaults to true. */
  koskExists?: boolean;
  courseKoskId?: string | null;
  muderris?: boolean;
  enrollment?: EnrollmentRow | null;
  /** an open ban bars the caller from the course (MDRS-177) */
  barred?: boolean;
  /** Nazırs of the medrese under test (`isNazir`). */
  madrasahNazirs?: string[];
  /** `KoskService.findVisibility` — the anonymous köşk path (MDRS-122). */
  koskVisibility?: { isPrivate: boolean } | null;
  /** `CourseRepository.findPublicVisibility` — the anonymous course path. */
  coursePublic?: {
    status: CourseStatus;
    archived: boolean;
    koskIsPrivate: boolean;
  } | null;
  /** `MadrasahService.exists`; defaults to true. */
  madrasahExists?: boolean;
}

const build = (s: Stubs = {}) => {
  const kosk = {
    exists: vi.fn().mockResolvedValue(s.koskExists ?? true),
    findVisibility: vi.fn().mockResolvedValue(s.koskVisibility ?? null),
    isManager: vi
      .fn()
      .mockImplementation(
        async (_koskId: string, userId: string) =>
          s.koskManagerId != null && s.koskManagerId === userId
      ),
  } as unknown as KoskService;
  const course = {
    findKoskId: vi.fn().mockResolvedValue(s.courseKoskId ?? null),
    isMuderris: vi.fn().mockResolvedValue(s.muderris ?? false),
    findEnrollment: vi.fn().mockResolvedValue(s.enrollment ?? null),
    findPublicVisibility: vi.fn().mockResolvedValue(s.coursePublic ?? null),
  } as unknown as CourseRepository;
  const deck = {
    // `findVisibility`, not `findById`: the resolver reads exactly `authorId`
    // and `isPublic`, and runs inside the guard on every deck request.
    findVisibility: vi.fn().mockResolvedValue(s.deck ?? null),
  } as unknown as FlashcardDeckService;
  const madrasah = {
    exists: vi.fn().mockResolvedValue(s.madrasahExists ?? true),
    isNazir: vi
      .fn()
      .mockImplementation(async (_madrasahId: string, userId: string) =>
        (s.madrasahNazirs ?? []).includes(userId)
      ),
  } as unknown as MadrasahService;
  const bans = {
    isBarredFromCourse: vi.fn().mockResolvedValue(s.barred ?? false),
  } as unknown as BanRepository;
  return {
    resolver: new TedrisatRoleResolver(kosk, course, deck, madrasah, bans),
    kosk,
    course,
    deck,
    madrasah,
    bans,
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
      ).resolves.toBe(RELATIONS.DECK_OWNER);
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
      ).resolves.toBe(RELATIONS.DECK_OWNER);
    });

    // MDRS-164: a deck that belongs to a course the caller is enrolled in is
    // read like a public one — PUBLIC holds VIEW and nothing that writes.
    it("returns PUBLIC for a private deck shared with the caller through a course", async () => {
      const { resolver, deck } = build({
        deck: {
          id: REAL_UUID,
          isPublic: false,
          authorId: "owner-1",
          sharedWithViewer: true,
        },
      });
      await expect(
        resolver.resolve("talebe", {
          entity: ENTITIES.FLASHCARD_DECK,
          id: REAL_UUID,
        })
      ).resolves.toBe(RELATIONS.PUBLIC);
      expect(deck.findVisibility).toHaveBeenCalledWith(REAL_UUID, "talebe");
    });

    // MDRS-43 AC-4: a stranger must not be able to tell somebody else's
    // private deck from a deck that is not there, so this is the SAME
    // `DeckNotFoundError` as the missing-deck case below, not a deny (403).
    it("404s a stranger on a private deck, exactly as for a missing one", async () => {
      const { resolver } = build({
        deck: { id: REAL_UUID, isPublic: false, authorId: "owner-1" },
      });
      await expect(
        resolver.resolve("stranger", {
          entity: ENTITIES.FLASHCARD_DECK,
          id: REAL_UUID,
        })
      ).rejects.toThrow(DeckNotFoundError);
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
      ).resolves.toBe(RELATIONS.PUBLIC);
    });

    // MDRS-43. This branch used to answer PUBLIC and leave the 404 to the
    // handler. With `@Authz` the guard decides FIRST, so on a write route the
    // handler that would have 404'd is never reached and "absent" came back as
    // a 403. The 404 moved into the resolver with the decision.
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
      ).resolves.toBe(RELATIONS.PUBLIC);
      expect(deck.findVisibility).not.toHaveBeenCalled();
    });
  });

  describe("resolveAnonymous — a caller with no token (MDRS-45)", () => {
    it("returns ANONYMOUS for a public deck", async () => {
      const { resolver } = build({
        deck: { id: REAL_UUID, isPublic: true, authorId: "owner-1" },
      });
      await expect(
        resolver.resolveAnonymous({
          entity: ENTITIES.FLASHCARD_DECK,
          id: REAL_UUID,
        })
      ).resolves.toBe(RELATIONS.ANONYMOUS);
    });

    it("404s a private deck, exactly as a missing one", async () => {
      const { resolver } = build({
        deck: { id: REAL_UUID, isPublic: false, authorId: "owner-1" },
      });
      await expect(
        resolver.resolveAnonymous({
          entity: ENTITIES.FLASHCARD_DECK,
          id: REAL_UUID,
        })
      ).rejects.toBeInstanceOf(DeckNotFoundError);
    });

    it("404s a deck that does not exist", async () => {
      const { resolver } = build({ deck: null });
      await expect(
        resolver.resolveAnonymous({
          entity: ENTITIES.FLASHCARD_DECK,
          id: OTHER_UUID,
        })
      ).rejects.toBeInstanceOf(DeckNotFoundError);
    });

    it("returns ANONYMOUS for a non-UUID id without touching the repository, so the pipe answers 400", async () => {
      const { resolver, deck } = build();
      await expect(
        resolver.resolveAnonymous({
          entity: ENTITIES.FLASHCARD_DECK,
          id: "not-a-uuid",
        })
      ).resolves.toBe(RELATIONS.ANONYMOUS);
      expect(deck.findVisibility).not.toHaveBeenCalled();
    });

    it("refuses an entity it does not know — MDRS-122 opened köşk, medrese and course pages only", async () => {
      const { resolver } = build();
      await expect(
        resolver.resolveAnonymous({
          entity: "ijazah" as never,
          id: REAL_UUID,
        })
      ).resolves.toBeNull();
    });
  });

  describe("resolveAnonymous — köşk, course and medrese pages (MDRS-122)", () => {
    const published = {
      status: CourseStatus.PUBLISHED,
      archived: false,
      koskIsPrivate: false,
    };

    it("returns ANONYMOUS for a listed köşk", async () => {
      const { resolver } = build({ koskVisibility: { isPrivate: false } });
      await expect(
        resolver.resolveAnonymous({ entity: ENTITIES.KOSK, id: REAL_UUID })
      ).resolves.toBe(RELATIONS.ANONYMOUS);
    });

    it.each([
      ["an unlisted köşk", { isPrivate: true }],
      ["a köşk that does not exist", null],
    ])("404s %s", async (_label, koskVisibility) => {
      const { resolver } = build({ koskVisibility });
      await expect(
        resolver.resolveAnonymous({ entity: ENTITIES.KOSK, id: REAL_UUID })
      ).rejects.toBeInstanceOf(KoskNotFoundError);
    });

    it("returns ANONYMOUS for a published course of a listed köşk", async () => {
      const { resolver } = build({ coursePublic: published });
      await expect(
        resolver.resolveAnonymous({ entity: ENTITIES.COURSE, id: REAL_UUID })
      ).resolves.toBe(RELATIONS.ANONYMOUS);
    });

    it.each([
      ["a course that does not exist", null],
      ["a draft", { ...published, status: CourseStatus.DRAFT }],
      ["a hidden course", { ...published, archived: true }],
      ["a course of an unlisted köşk", { ...published, koskIsPrivate: true }],
    ])("404s %s", async (_label, coursePublic) => {
      const { resolver } = build({ coursePublic });
      await expect(
        resolver.resolveAnonymous({ entity: ENTITIES.COURSE, id: REAL_UUID })
      ).rejects.toBeInstanceOf(CourseNotFoundError);
    });

    it("returns ANONYMOUS for a medrese that exists, and 404s one that does not", async () => {
      await expect(
        build().resolver.resolveAnonymous({
          entity: ENTITIES.MADRASAH,
          id: REAL_UUID,
        })
      ).resolves.toBe(RELATIONS.ANONYMOUS);
      await expect(
        build({ madrasahExists: false }).resolver.resolveAnonymous({
          entity: ENTITIES.MADRASAH,
          id: REAL_UUID,
        })
      ).rejects.toBeInstanceOf(MadrasahNotFoundError);
    });

    it.each([
      ENTITIES.KOSK,
      ENTITIES.COURSE,
      ENTITIES.MADRASAH,
    ])("returns ANONYMOUS for a non-UUID %s id without a lookup, so the pipe answers 400", async (entity) => {
      const { resolver, kosk, course, madrasah } = build();
      await expect(
        resolver.resolveAnonymous({ entity, id: "not-a-uuid" })
      ).resolves.toBe(RELATIONS.ANONYMOUS);
      expect(kosk.findVisibility).not.toHaveBeenCalled();
      expect(course.findPublicVisibility).not.toHaveBeenCalled();
      expect(madrasah.exists).not.toHaveBeenCalled();
    });
  });

  describe("kosk dispatch", () => {
    // MDRS-135: a köşk nazımı is a role (`role_assignments`), not a relationship,
    // so the resolver answers the same for the manager as for a stranger and
    // `AuthzService` adds what KOSK_NAZIM holds.
    it("returns PUBLIC for the köşk's manager too: the role is not the resolver's", async () => {
      const { resolver, kosk } = build({ koskManagerId: "manager-1" });
      await expect(
        resolver.resolve("manager-1", { entity: ENTITIES.KOSK, id: REAL_UUID })
      ).resolves.toBe(RELATIONS.PUBLIC);
      expect(kosk.isManager).not.toHaveBeenCalled();
    });

    it("returns PUBLIC for any non-owner on an existing köşk", async () => {
      const { resolver } = build({ koskManagerId: "manager-1" });
      await expect(
        resolver.resolve("stranger", { entity: ENTITIES.KOSK, id: REAL_UUID })
      ).resolves.toBe(RELATIONS.PUBLIC);
    });

    it("404s when the köşk does not exist, rather than denying", async () => {
      const { resolver } = build({ koskExists: false });
      await expect(
        resolver.resolve("u", { entity: ENTITIES.KOSK, id: OTHER_UUID })
      ).rejects.toThrow(KoskNotFoundError);
    });

    it("returns PUBLIC for non-UUID köşk ids", async () => {
      const { resolver, kosk, madrasah } = build();
      await expect(
        resolver.resolve("u", { entity: ENTITIES.KOSK, id: "new" })
      ).resolves.toBe(RELATIONS.PUBLIC);
      expect(kosk.exists).not.toHaveBeenCalled();
      expect(kosk.isManager).not.toHaveBeenCalled();
      expect(madrasah.isNazir).not.toHaveBeenCalled();
    });

    // MDRS-134 removed the MADRASAH_NAZIR path MDRS-106 added: a medrese's
    // only link to a köşk is a hosting right, which gives it no power there.
    // Fails if the resolver consults the medrese again.
    it("gives a medrese's nazır nothing but PUBLIC on a köşk", async () => {
      const { resolver, madrasah } = build({
        koskManagerId: "manager-1",
        madrasahNazirs: ["nazir-1"],
      });
      await expect(
        resolver.resolve("nazir-1", { entity: ENTITIES.KOSK, id: REAL_UUID })
      ).resolves.toBe(RELATIONS.PUBLIC);
      expect(madrasah.isNazir).not.toHaveBeenCalled();
    });
  });

  describe("madrasah dispatch (MDRS-106)", () => {
    // MDRS-135: the başmüderris is a role, not a relationship.
    it("returns PUBLIC for a başmüderris too, and does not look the role up", async () => {
      const { resolver, madrasah } = build({ madrasahNazirs: ["nazir-1"] });
      await expect(
        resolver.resolve("nazir-1", {
          entity: ENTITIES.MADRASAH,
          id: REAL_UUID,
        })
      ).resolves.toBe(RELATIONS.PUBLIC);
      expect(madrasah.isNazir).not.toHaveBeenCalled();
    });

    it("returns PUBLIC for anyone else, including on a missing medrese", async () => {
      const { resolver } = build({ madrasahNazirs: ["nazir-1"] });
      await expect(
        resolver.resolve("stranger", {
          entity: ENTITIES.MADRASAH,
          id: REAL_UUID,
        })
      ).resolves.toBe(RELATIONS.PUBLIC);
    });

    it("returns PUBLIC for non-UUID ids (list, create) without a lookup", async () => {
      const { resolver, madrasah } = build({ madrasahNazirs: ["nazir-1"] });
      await expect(
        resolver.resolve("nazir-1", { entity: ENTITIES.MADRASAH, id: "any" })
      ).resolves.toBe(RELATIONS.PUBLIC);
      expect(madrasah.isNazir).not.toHaveBeenCalled();
    });
  });

  describe("course dispatch (enrolled > pending > public; roles are not the resolver's, MDRS-135)", () => {
    it("answers PUBLIC for the parent köşk's manager and a müderris without asking who they are", async () => {
      const { resolver, kosk, course } = build({
        courseKoskId: KOSK_UUID,
        koskManagerId: "manager-1",
        muderris: true,
      });
      await expect(
        resolver.resolve("manager-1", {
          entity: ENTITIES.COURSE,
          id: REAL_UUID,
        })
      ).resolves.toBe(RELATIONS.PUBLIC);
      expect(kosk.isManager).not.toHaveBeenCalled();
      expect(course.isMuderris).not.toHaveBeenCalled();
    });

    it("keeps a staff member's own enrollment: the relationship adds to the role", async () => {
      const { resolver } = build({
        courseKoskId: KOSK_UUID,
        koskManagerId: "manager-1",
        enrollment: { status: EnrollmentStatus.PENDING },
      });
      await expect(
        resolver.resolve("manager-1", {
          entity: ENTITIES.COURSE,
          id: REAL_UUID,
        })
      ).resolves.toBe(RELATIONS.PENDING);
    });

    it("returns ENROLLED when caller has an ENROLLED enrollment", async () => {
      const { resolver } = build({
        courseKoskId: KOSK_UUID,
        koskManagerId: "someone-else",
        enrollment: { status: EnrollmentStatus.ENROLLED },
      });
      await expect(
        resolver.resolve("talebe-1", {
          entity: ENTITIES.COURSE,
          id: REAL_UUID,
        })
      ).resolves.toBe(RELATIONS.ENROLLED);
    });

    it("treats a barred, enrolled talebe as PUBLIC (MDRS-177)", async () => {
      const { resolver, bans } = build({
        courseKoskId: KOSK_UUID,
        koskManagerId: "someone-else",
        enrollment: { status: EnrollmentStatus.ENROLLED },
        barred: true,
      });
      await expect(
        resolver.resolve("talebe-1", {
          entity: ENTITIES.COURSE,
          id: REAL_UUID,
        })
      ).resolves.toBe(RELATIONS.PUBLIC);
      expect(bans.isBarredFromCourse).toHaveBeenCalledWith(
        "talebe-1",
        REAL_UUID
      );
    });

    // Staff are never barred (`BanService.create` refuses it), and what a
    // ban takes away is the talebe relationship: a barred caller is PUBLIC
    // here, and whatever role they hold is added by `AuthzService`.

    it("returns PENDING when caller has a PENDING enrollment", async () => {
      const { resolver } = build({
        courseKoskId: KOSK_UUID,
        koskManagerId: "someone-else",
        enrollment: { status: EnrollmentStatus.PENDING },
      });
      await expect(
        resolver.resolve("talebe-pending", {
          entity: ENTITIES.COURSE,
          id: REAL_UUID,
        })
      ).resolves.toBe(RELATIONS.PENDING);
    });

    it("returns PUBLIC for a stranger with no relationship to the course", async () => {
      const { resolver } = build({
        courseKoskId: KOSK_UUID,
        koskManagerId: "someone-else",
      });
      await expect(
        resolver.resolve("stranger", {
          entity: ENTITIES.COURSE,
          id: REAL_UUID,
        })
      ).resolves.toBe(RELATIONS.PUBLIC);
    });

    it("issues the course row lookup and the enrollment lookup once each, and nothing about roles", async () => {
      const { resolver, kosk, course } = build({
        courseKoskId: KOSK_UUID,
        koskManagerId: "someone-else",
      });
      await resolver.resolve("stranger", {
        entity: ENTITIES.COURSE,
        id: REAL_UUID,
      });
      expect(course.findKoskId).toHaveBeenCalledTimes(1);
      expect(course.findKoskId).toHaveBeenCalledWith(REAL_UUID);
      expect(course.findEnrollment).toHaveBeenCalledTimes(1);
      expect(course.findEnrollment).toHaveBeenCalledWith("stranger", REAL_UUID);
      expect(kosk.isManager).not.toHaveBeenCalled();
      expect(course.isMuderris).not.toHaveBeenCalled();
    });

    it("never makes a nazır of the parent köşk's medrese more than PUBLIC on the course", async () => {
      const { resolver, madrasah } = build({
        courseKoskId: KOSK_UUID,
        koskManagerId: "someone-else",
        madrasahNazirs: ["nazir-1"],
      });
      await expect(
        resolver.resolve("nazir-1", {
          entity: ENTITIES.COURSE,
          id: REAL_UUID,
        })
      ).resolves.toBe(RELATIONS.PUBLIC);
      expect(madrasah.isNazir).not.toHaveBeenCalled();
    });

    it("404s when the course does not exist, without the dependent lookups", async () => {
      const { resolver, kosk, course } = build({ courseKoskId: null });
      await expect(
        resolver.resolve("u", { entity: ENTITIES.COURSE, id: OTHER_UUID })
      ).rejects.toThrow(CourseNotFoundError);
      expect(kosk.isManager).not.toHaveBeenCalled();
      expect(course.isMuderris).not.toHaveBeenCalled();
      expect(course.findEnrollment).not.toHaveBeenCalled();
    });
  });

  // `ijazah` returns with the icazet record (MDRS-149); until then the entity
  // does not exist and a resolver is never asked about it.
});
