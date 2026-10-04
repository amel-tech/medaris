import { AuthzForbiddenError, AuthzService } from "@medaris/common";
import { Test, TestingModule } from "@nestjs/testing";
import { CardIncludeEnum } from "../../../src/flashcard/domain/card-include.enum";
import { FlashcardProgressStatus } from "../../../src/flashcard/domain/flashcard-progress-status.enum";
import { FlashcardType } from "../../../src/flashcard/domain/flashcard-type.enum";
import { ReviewRating } from "../../../src/flashcard/domain/review-rating.enum";
import { CreateFlashcardDto } from "../../../src/flashcard/dto/create-flashcard.dto";
import { CreateFlashcardProgressDto } from "../../../src/flashcard/dto/create-flashcard-progress.dto";
import { CardNotFoundError } from "../../../src/flashcard/errors/card-not-found.error";
import { FlashcardRepository } from "../../../src/flashcard/flashcard.repository";
import { IFlashcard } from "../../../src/flashcard/flashcard.repository.interface";
import { FlashcardService } from "../../../src/flashcard/flashcard.service";

/**
 * MDRS-32. Ported from the deleted `test/unit/example/example.service.spec.ts`:
 * same shape — mount the real service, provide a mocked repository, and assert
 * the arguments the service hands down plus the repository error paths. What
 * the example spec could not exercise, and this one does, is the mapping the
 * service performs on the way down: the include allow-list and the deckId /
 * authorId / userId fields the service stitches onto its DTOs.
 */
describe("FlashcardService", () => {
  let service: FlashcardService;

  const mockFlashcardRepository = {
    findById: vi.fn(),
    findByDeckId: vi.fn(),
    createMany: vi.fn(),
    replaceManyProgress: vi.fn(),
    findProgress: vi.fn().mockResolvedValue([]),
    findStudyQueue: vi.fn(),
    findVisibilityByIds: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  // Only `isSystemAdmin` is reached from this service — the card resolver's
  // realm bypass. Defaults to "not an admin"; the tests that ask what the
  // başnazım may do override it.
  const mockAuthzService = { isSystemAdmin: vi.fn().mockReturnValue(false) };

  const DECK_ID = "8f14e45f-ceea-467a-9e9a-1c1b9b0d5a11";
  const USER_ID = "623fdf08-fd0e-481b-a927-4a1c15135e62";
  const CARD_ID = "1f9d5b6a-3c2e-4f80-9a11-7de0c5f2b4a3";
  // `replaceManyProgress` takes the whole token payload, not just `sub`: the
  // SYSTEM_ADMIN bypass reads `realm_access`.
  const USER = { sub: USER_ID } as Parameters<
    FlashcardService["replaceManyProgress"]
  >[0];
  const ownVisibility = {
    cardId: CARD_ID,
    deckId: DECK_ID,
    authorId: USER_ID,
    isPublic: false,
    sharedWithViewer: false,
  };

  const card: IFlashcard = {
    id: CARD_ID,
    deckId: DECK_ID,
    authorId: USER_ID,
    type: FlashcardType.VOCABULARY,
    contentFront: "أهلاً",
    contentBack: "selam",
    contentMeta: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlashcardService,
        { provide: FlashcardRepository, useValue: mockFlashcardRepository },
        { provide: AuthzService, useValue: mockAuthzService },
      ],
    }).compile();

    service = module.get<FlashcardService>(FlashcardService);
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockAuthzService.isSystemAdmin.mockReturnValue(false);
  });

  describe("findById", () => {
    it("passes the recognised includes through as a set", async () => {
      mockFlashcardRepository.findById.mockResolvedValue(card);

      const result = await service.findById(CARD_ID, USER_ID, ["progress"]);

      expect(mockFlashcardRepository.findById).toHaveBeenCalledWith(
        CARD_ID,
        USER_ID,
        new Set([CardIncludeEnum.Progress])
      );
      expect(result).toEqual(card);
    });

    it("drops include values that are not in the enum", async () => {
      mockFlashcardRepository.findById.mockResolvedValue(card);

      await service.findById(CARD_ID, USER_ID, ["progress", "author", ""]);

      expect(mockFlashcardRepository.findById).toHaveBeenCalledWith(
        CARD_ID,
        USER_ID,
        new Set([CardIncludeEnum.Progress])
      );
    });

    it("passes an empty set when include is omitted", async () => {
      mockFlashcardRepository.findById.mockResolvedValue(null);

      const result = await service.findById(CARD_ID, USER_ID);

      expect(mockFlashcardRepository.findById).toHaveBeenCalledWith(
        CARD_ID,
        USER_ID,
        new Set()
      );
      expect(result).toBeNull();
    });

    it("propagates repository errors", async () => {
      const error = new Error("Database connection failed");
      mockFlashcardRepository.findById.mockRejectedValue(error);

      await expect(service.findById(CARD_ID, USER_ID)).rejects.toThrow(error);
      expect(mockFlashcardRepository.findById).toHaveBeenCalledTimes(1);
    });
  });

  describe("findByDeckId", () => {
    it("returns the cards the repository yields", async () => {
      mockFlashcardRepository.findByDeckId.mockResolvedValue([card]);

      const result = await service.findByDeckId(DECK_ID, USER_ID, ["progress"]);

      expect(mockFlashcardRepository.findByDeckId).toHaveBeenCalledWith(
        DECK_ID,
        USER_ID,
        new Set([CardIncludeEnum.Progress])
      );
      expect(result).toEqual([card]);
    });

    it("propagates repository errors", async () => {
      const error = new Error("Database connection failed");
      mockFlashcardRepository.findByDeckId.mockRejectedValue(error);

      await expect(service.findByDeckId(DECK_ID, USER_ID)).rejects.toThrow(
        error
      );
    });
  });

  describe("createMany", () => {
    const cards: CreateFlashcardDto[] = [
      {
        type: FlashcardType.VOCABULARY,
        contentFront: "أهلاً",
        contentBack: "selam",
      },
      {
        type: FlashcardType.HADEETH,
        contentFront: "إنما الأعمال بالنيات",
        contentBack: "ameller niyetlere göredir",
      },
    ];

    it("stamps deckId and authorId onto every card", async () => {
      mockFlashcardRepository.createMany.mockResolvedValue([card]);

      const result = await service.createMany(DECK_ID, USER_ID, cards);

      expect(mockFlashcardRepository.createMany).toHaveBeenCalledWith([
        { ...cards[0], deckId: DECK_ID, authorId: USER_ID },
        { ...cards[1], deckId: DECK_ID, authorId: USER_ID },
      ]);
      expect(result).toEqual([card]);
    });

    it("hands an empty batch down unchanged", async () => {
      mockFlashcardRepository.createMany.mockResolvedValue([]);

      const result = await service.createMany(DECK_ID, USER_ID, []);

      expect(mockFlashcardRepository.createMany).toHaveBeenCalledWith([]);
      expect(result).toEqual([]);
    });

    it("propagates repository errors during creation", async () => {
      const error = new Error("Database constraint violation");
      mockFlashcardRepository.createMany.mockRejectedValue(error);

      await expect(service.createMany(DECK_ID, USER_ID, cards)).rejects.toThrow(
        error
      );
    });
  });

  describe("replaceManyProgress", () => {
    const progress: CreateFlashcardProgressDto[] = [
      { flashcardId: CARD_ID, status: FlashcardProgressStatus.LEARNING },
    ];

    // What a bare status (no rating) becomes: no schedule, a review stamp.
    const bareRow = {
      flashcardId: CARD_ID,
      status: FlashcardProgressStatus.LEARNING,
      dueAt: null,
      reviewedAt: expect.any(Date),
      intervalDays: 0,
    };

    beforeEach(() => {
      // Default: the caller owns the card's deck, so the visibility check
      // passes and each test below exercises what it is actually about.
      mockFlashcardRepository.findVisibilityByIds.mockResolvedValue([
        ownVisibility,
      ]);
    });

    it("attaches the caller's userId to every row", async () => {
      mockFlashcardRepository.replaceManyProgress.mockResolvedValue([
        { ...progress[0], userId: USER_ID },
      ]);

      const result = await service.replaceManyProgress(USER, progress);

      expect(mockFlashcardRepository.replaceManyProgress).toHaveBeenCalledWith([
        { ...bareRow, userId: USER_ID },
      ]);
      expect(result).toEqual([{ ...progress[0], userId: USER_ID }]);
    });

    // Pins the precedence, not just the presence. Nothing upstream strips a
    // body-supplied `userId`: `CreateFlashcardProgressDto` declares no such
    // field so TypeScript never sees one, but the route's `ParseArrayPipe`
    // inherits neither `whitelist` nor `forbidNonWhitelisted` (see the note in
    // flashcard.service.ts). The service's spread order is the only thing
    // standing between a body-supplied `userId` and one user writing another
    // user's progress.
    it("overrides a userId supplied in the payload", async () => {
      const spoofed = [
        { ...progress[0], userId: "00000000-0000-4000-8000-000000000000" },
      ] as CreateFlashcardProgressDto[];
      mockFlashcardRepository.replaceManyProgress.mockResolvedValue([]);

      await service.replaceManyProgress(USER, spoofed);

      expect(mockFlashcardRepository.replaceManyProgress).toHaveBeenCalledWith([
        { ...bareRow, userId: USER_ID },
      ]);
    });

    it("propagates repository errors", async () => {
      const error = new Error("Database connection failed");
      mockFlashcardRepository.replaceManyProgress.mockRejectedValue(error);

      await expect(service.replaceManyProgress(USER, progress)).rejects.toThrow(
        error
      );
    });

    // MDRS-43 AC-5. The two outcomes are deliberately different: "no such
    // card" is a 404 and "a deck you cannot reach" is a 403. Before this,
    // a real id in somebody else's private deck answered 200 and an unknown
    // id tripped the `flashcardId` FK as a 500.
    it("404s an id with no card behind it, and writes nothing", async () => {
      mockFlashcardRepository.findVisibilityByIds.mockResolvedValue([]);

      await expect(service.replaceManyProgress(USER, progress)).rejects.toThrow(
        CardNotFoundError
      );
      expect(
        mockFlashcardRepository.replaceManyProgress
      ).not.toHaveBeenCalled();
    });

    it("403s a card in another user's private deck, and writes nothing", async () => {
      mockFlashcardRepository.findVisibilityByIds.mockResolvedValue([
        { ...ownVisibility, authorId: "11111111-1111-1111-1111-111111111111" },
      ]);

      await expect(service.replaceManyProgress(USER, progress)).rejects.toThrow(
        AuthzForbiddenError
      );
      expect(
        mockFlashcardRepository.replaceManyProgress
      ).not.toHaveBeenCalled();
    });

    it("allows a card in another user's PUBLIC deck — studying one is the point", async () => {
      mockFlashcardRepository.findVisibilityByIds.mockResolvedValue([
        {
          ...ownVisibility,
          authorId: "11111111-1111-1111-1111-111111111111",
          isPublic: true,
        },
      ]);
      mockFlashcardRepository.replaceManyProgress.mockResolvedValue([]);

      await service.replaceManyProgress(USER, progress);

      expect(
        mockFlashcardRepository.replaceManyProgress
      ).toHaveBeenCalledOnce();
    });

    it("de-duplicates ids before asking, so a study session pays one query", async () => {
      mockFlashcardRepository.replaceManyProgress.mockResolvedValue([]);

      await service.replaceManyProgress(USER, [
        ...progress,
        ...progress,
        ...progress,
      ]);

      expect(
        mockFlashcardRepository.findVisibilityByIds
      ).toHaveBeenCalledExactlyOnceWith([CARD_ID], USER_ID);
    });

    // MDRS-164: a deck that belongs to a course the caller is enrolled in is
    // readable like a public one, so its cards take progress.
    it("allows a card in a private deck shared with the caller through a course", async () => {
      mockFlashcardRepository.findVisibilityByIds.mockResolvedValue([
        {
          ...ownVisibility,
          authorId: "someone-else",
          sharedWithViewer: true,
        },
      ]);
      mockFlashcardRepository.replaceManyProgress.mockResolvedValue([]);

      await expect(
        service.replaceManyProgress(USER, progress)
      ).resolves.toEqual([]);
    });

    // MDRS-165: a rating makes the server decide the state and the next time.
    it("schedules a rated card from the rating and the last gap, ignoring a status sent along", async () => {
      mockFlashcardRepository.findProgress.mockResolvedValue([
        { flashcardId: CARD_ID, intervalDays: 7 },
      ]);
      mockFlashcardRepository.replaceManyProgress.mockResolvedValue([]);
      const before = Date.now();

      await service.replaceManyProgress(USER, [
        {
          flashcardId: CARD_ID,
          status: FlashcardProgressStatus.NEW,
          rating: ReviewRating.EASY,
        },
      ]);

      const [rows] = mockFlashcardRepository.replaceManyProgress.mock.calls[0];
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        flashcardId: CARD_ID,
        userId: USER_ID,
        status: FlashcardProgressStatus.MASTERED,
        intervalDays: 14,
      });
      expect(rows[0].dueAt.getTime()).toBeGreaterThanOrEqual(
        before + 14 * 24 * 60 * 60 * 1000
      );
    });

    it("reads the last gap only for the cards that were rated", async () => {
      mockFlashcardRepository.findProgress.mockClear();
      mockFlashcardRepository.replaceManyProgress.mockResolvedValue([]);

      await service.replaceManyProgress(USER, progress);

      expect(mockFlashcardRepository.findProgress).toHaveBeenCalledWith(
        USER_ID,
        []
      );
    });

    // MDRS-148: the başnazım reads another person's private deck, and that
    // read exception is not a licence to write study progress on it.
    it("403s the başnazım on a card in another user's private deck, and writes nothing", async () => {
      mockAuthzService.isSystemAdmin.mockReturnValue(true);
      mockFlashcardRepository.findVisibilityByIds.mockResolvedValue([
        { ...ownVisibility, authorId: "11111111-1111-1111-1111-111111111111" },
      ]);

      await expect(service.replaceManyProgress(USER, progress)).rejects.toThrow(
        AuthzForbiddenError
      );
      expect(
        mockFlashcardRepository.replaceManyProgress
      ).not.toHaveBeenCalled();
    });

    it("still lets the başnazım record progress on a PUBLIC deck", async () => {
      mockAuthzService.isSystemAdmin.mockReturnValue(true);
      mockFlashcardRepository.findVisibilityByIds.mockResolvedValue([
        {
          ...ownVisibility,
          authorId: "11111111-1111-1111-1111-111111111111",
          isPublic: true,
        },
      ]);
      mockFlashcardRepository.replaceManyProgress.mockResolvedValue([]);

      await service.replaceManyProgress(USER, progress);

      expect(
        mockFlashcardRepository.replaceManyProgress
      ).toHaveBeenCalledOnce();
    });
  });

  // The card routes' `@Authz` resolver. MDRS-43 AC-4: "no such card" and "a
  // card in a deck you may not see" must be indistinguishable, so both are
  // the same CardNotFoundError — unlike the progress route above, whose AC
  // asks for the 403.
  describe("findVisibleDeckId", () => {
    const STRANGER = "11111111-1111-1111-1111-111111111111";

    it("returns the parent deck of the caller's own card", async () => {
      mockFlashcardRepository.findVisibilityByIds.mockResolvedValue([
        ownVisibility,
      ]);

      await expect(service.findVisibleDeckId(USER, CARD_ID)).resolves.toBe(
        DECK_ID
      );
    });

    it("returns the parent deck of a card in another user's PUBLIC deck", async () => {
      mockFlashcardRepository.findVisibilityByIds.mockResolvedValue([
        { ...ownVisibility, authorId: STRANGER, isPublic: true },
      ]);

      await expect(service.findVisibleDeckId(USER, CARD_ID)).resolves.toBe(
        DECK_ID
      );
    });

    it("404s a card in another user's private deck, exactly as a missing one", async () => {
      mockFlashcardRepository.findVisibilityByIds.mockResolvedValue([
        { ...ownVisibility, authorId: STRANGER },
      ]);
      await expect(service.findVisibleDeckId(USER, CARD_ID)).rejects.toThrow(
        CardNotFoundError
      );

      mockFlashcardRepository.findVisibilityByIds.mockResolvedValue([]);
      await expect(service.findVisibleDeckId(USER, CARD_ID)).rejects.toThrow(
        CardNotFoundError
      );
    });

    it("lets SYSTEM_ADMIN through to a card in a private deck", async () => {
      mockAuthzService.isSystemAdmin.mockReturnValue(true);
      mockFlashcardRepository.findVisibilityByIds.mockResolvedValue([
        { ...ownVisibility, authorId: STRANGER },
      ]);

      await expect(service.findVisibleDeckId(USER, CARD_ID)).resolves.toBe(
        DECK_ID
      );
    });
  });

  describe("update", () => {
    it("forwards the patch and returns the updated card", async () => {
      const updates = { contentBack: "merhaba" };
      mockFlashcardRepository.update.mockResolvedValue({ ...card, ...updates });

      const result = await service.update(CARD_ID, updates);

      expect(mockFlashcardRepository.update).toHaveBeenCalledWith(
        CARD_ID,
        updates
      );
      expect(result).toEqual({ ...card, ...updates });
    });

    it("returns null when the card does not exist", async () => {
      mockFlashcardRepository.update.mockResolvedValue(null);

      await expect(service.update(CARD_ID, {})).resolves.toBeNull();
    });
  });

  describe("delete", () => {
    it("returns true when the repository deleted a row", async () => {
      mockFlashcardRepository.delete.mockResolvedValue(true);

      await expect(service.delete(CARD_ID)).resolves.toBe(true);
      expect(mockFlashcardRepository.delete).toHaveBeenCalledWith(CARD_ID);
    });

    it("returns false when nothing matched", async () => {
      mockFlashcardRepository.delete.mockResolvedValue(false);

      await expect(service.delete(CARD_ID)).resolves.toBe(false);
    });

    it("propagates repository errors during deletion", async () => {
      const error = new Error("Database connection failed");
      mockFlashcardRepository.delete.mockRejectedValue(error);

      await expect(service.delete(CARD_ID)).rejects.toThrow(error);
      expect(mockFlashcardRepository.delete).toHaveBeenCalledTimes(1);
    });
  });
});
