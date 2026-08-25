import { Test, TestingModule } from "@nestjs/testing";
import { FlashcardDeckLabelNotFoundError } from "../../../src/flashcard/errors/flashcard-deck-label-not-found.error";
import { FlashcardLabelNotFoundError } from "../../../src/flashcard/errors/flashcard-label-not-found.error";
import { FlashcardDeckLabelRepository } from "../../../src/flashcard/flashcard-deck-label.repository";
import { FlashcardDeckLabelService } from "../../../src/flashcard/flashcard-deck-label.service";
import { FlashcardLabelRepository } from "../../../src/flashcard/flashcard-label.reporsitory";
import { FlashcardLabelService } from "../../../src/flashcard/flashcard-label.service";

const MISSING_ID = "00000000-0000-0000-0000-000000000000";

/**
 * MDRS-58. Both services' read methods used to return the repository's `null`
 * straight to the controller, which declared a 200 carrying a response object.
 * Nest serialises `null` as an EMPTY body, so an unknown id answered 200 with
 * nothing in it — and once MDRS-58 generated a typed client from that contract,
 * `JSONApiResponse.value()` called `response.json()` on the empty body and threw
 * `SyntaxError: Unexpected end of JSON input` from a method whose signature
 * promised a label.
 *
 * These assertions pin the 404 that replaced it. The repositories are mocked
 * rather than the services, so what is asserted is the services' own branch.
 */
describe("flashcard label readers reject an unknown id", () => {
  let labelService: FlashcardLabelService;
  let deckLabelService: FlashcardDeckLabelService;

  const labelRepo = {
    getById: vi.fn(),
    getLabelStats: vi.fn(),
  };
  const deckLabelRepo = {
    getById: vi.fn(),
    getLabelStats: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlashcardLabelService,
        FlashcardDeckLabelService,
        { provide: FlashcardLabelRepository, useValue: labelRepo },
        { provide: FlashcardDeckLabelRepository, useValue: deckLabelRepo },
      ],
    }).compile();

    labelService = module.get(FlashcardLabelService);
    deckLabelService = module.get(FlashcardDeckLabelService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("FlashcardLabelService", () => {
    it("throws FlashcardLabelNotFoundError instead of returning null from getById", async () => {
      labelRepo.getById.mockResolvedValue(null);

      await expect(labelService.getById(MISSING_ID)).rejects.toBeInstanceOf(
        FlashcardLabelNotFoundError
      );
    });

    it("throws instead of returning null from getLabelStats", async () => {
      labelRepo.getLabelStats.mockResolvedValue(null);

      await expect(
        labelService.getLabelStats(MISSING_ID)
      ).rejects.toBeInstanceOf(FlashcardLabelNotFoundError);
    });

    it("still returns the row when there is one", async () => {
      const label = { id: MISSING_ID, title: "Kelam", userId: "u1" };
      labelRepo.getById.mockResolvedValue(label);

      await expect(labelService.getById(MISSING_ID)).resolves.toBe(label);
    });
  });

  describe("FlashcardDeckLabelService", () => {
    it("throws FlashcardDeckLabelNotFoundError instead of returning null from getById", async () => {
      deckLabelRepo.getById.mockResolvedValue(null);

      await expect(deckLabelService.getById(MISSING_ID)).rejects.toBeInstanceOf(
        FlashcardDeckLabelNotFoundError
      );
    });

    it("throws instead of returning null from getDeckLabelStats", async () => {
      deckLabelRepo.getLabelStats.mockResolvedValue(null);

      await expect(
        deckLabelService.getDeckLabelStats(MISSING_ID)
      ).rejects.toBeInstanceOf(FlashcardDeckLabelNotFoundError);
    });

    it("still returns the row when there is one", async () => {
      const stats = { labelId: MISSING_ID, usageCount: 3 };
      deckLabelRepo.getLabelStats.mockResolvedValue(stats);

      await expect(
        deckLabelService.getDeckLabelStats(MISSING_ID)
      ).resolves.toBe(stats);
    });
  });
});
