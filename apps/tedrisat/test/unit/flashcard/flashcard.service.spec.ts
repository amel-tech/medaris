import { Test, TestingModule } from "@nestjs/testing";
import { CardIncludeEnum } from "../../../src/flashcard/domain/card-include.enum";
import { FlashcardProgressStatus } from "../../../src/flashcard/domain/flashcard-progress-status.enum";
import { FlashcardType } from "../../../src/flashcard/domain/flashcard-type.enum";
import { CreateFlashcardDto } from "../../../src/flashcard/dto/create-flashcard.dto";
import { CreateFlashcardProgressDto } from "../../../src/flashcard/dto/create-flashcard-progress.dto";
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
    update: vi.fn(),
    delete: vi.fn(),
  };

  const DECK_ID = "8f14e45f-ceea-467a-9e9a-1c1b9b0d5a11";
  const USER_ID = "623fdf08-fd0e-481b-a927-4a1c15135e62";
  const CARD_ID = "1f9d5b6a-3c2e-4f80-9a11-7de0c5f2b4a3";

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
      ],
    }).compile();

    service = module.get<FlashcardService>(FlashcardService);
  });

  afterEach(() => {
    vi.clearAllMocks();
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

    it("attaches the caller's userId to every row", async () => {
      mockFlashcardRepository.replaceManyProgress.mockResolvedValue([
        { ...progress[0], userId: USER_ID },
      ]);

      const result = await service.replaceManyProgress(USER_ID, progress);

      expect(mockFlashcardRepository.replaceManyProgress).toHaveBeenCalledWith([
        { ...progress[0], userId: USER_ID },
      ]);
      expect(result).toEqual([{ ...progress[0], userId: USER_ID }]);
    });

    // Pins the precedence, not just the presence. The validation pipe means no
    // request can carry a `userId` today, so this asserts the service's own
    // spread order rather than a reachable exploit — but that order is the only
    // thing standing between a future DTO field and one user writing another
    // user's progress.
    it("overrides a userId supplied in the payload", async () => {
      const spoofed = [
        { ...progress[0], userId: "00000000-0000-4000-8000-000000000000" },
      ] as CreateFlashcardProgressDto[];
      mockFlashcardRepository.replaceManyProgress.mockResolvedValue([]);

      await service.replaceManyProgress(USER_ID, spoofed);

      expect(mockFlashcardRepository.replaceManyProgress).toHaveBeenCalledWith([
        { ...progress[0], userId: USER_ID },
      ]);
    });

    it("propagates repository errors", async () => {
      const error = new Error("Database connection failed");
      mockFlashcardRepository.replaceManyProgress.mockRejectedValue(error);

      await expect(
        service.replaceManyProgress(USER_ID, progress)
      ).rejects.toThrow(error);
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
