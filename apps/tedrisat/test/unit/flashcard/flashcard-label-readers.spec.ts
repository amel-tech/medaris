import { Test, TestingModule } from "@nestjs/testing";
import { FlashcardDeckLabelNotFoundError } from "../../../src/flashcard/errors/flashcard-deck-label-not-found.error";
import { FlashcardLabelNotFoundError } from "../../../src/flashcard/errors/flashcard-label-not-found.error";
import { FlashcardDeckLabelRepository } from "../../../src/flashcard/flashcard-deck-label.repository";
import { FlashcardDeckLabelService } from "../../../src/flashcard/flashcard-deck-label.service";
import { FlashcardLabelRepository } from "../../../src/flashcard/flashcard-label.reporsitory";
import { FlashcardLabelService } from "../../../src/flashcard/flashcard-label.service";

const MISSING_ID = "00000000-0000-0000-0000-000000000000";
const LABEL_ID = "11111111-1111-1111-1111-111111111111";
const OWNER = "owner-1";

/**
 * MDRS-58. Both services' read methods used to return the repository's `null`
 * straight to the controller, which declared a 200 carrying a response object.
 * Nest serialises `null` as an EMPTY body, so an unknown id answered 200 with
 * nothing in it — and once MDRS-58 generated a typed client from that contract,
 * `JSONApiResponse.value()` called `response.json()` on the empty body and threw
 * `SyntaxError: Unexpected end of JSON input` from a method whose signature
 * promised a label.
 *
 * These assertions pin what replaced it: a 404 for a label that does not
 * exist, and — for the stats readers — a zero-valued stats object for a label
 * that exists but has never been applied, because the stats row is created
 * lazily and "never used" is not "not found" (MDRS-58 review). Ownership
 * (MDRS-56) runs first on every reader; the repositories are mocked rather than
 * the services, so what is asserted is the services' own branches.
 */
describe("flashcard label readers", () => {
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
    const ownLabel = { id: LABEL_ID, title: "Kelam", userId: OWNER };

    it("throws FlashcardLabelNotFoundError instead of returning null from getById", async () => {
      labelRepo.getById.mockResolvedValue(null);

      await expect(
        labelService.getById(MISSING_ID, OWNER)
      ).rejects.toBeInstanceOf(FlashcardLabelNotFoundError);
    });

    it("throws FlashcardLabelNotFoundError from getLabelStats when the LABEL is missing", async () => {
      labelRepo.getById.mockResolvedValue(null);

      await expect(
        labelService.getLabelStats(MISSING_ID, OWNER)
      ).rejects.toBeInstanceOf(FlashcardLabelNotFoundError);
      expect(labelRepo.getLabelStats).not.toHaveBeenCalled();
    });

    it("answers a label that exists but was never applied with zero counts, not 404", async () => {
      labelRepo.getById.mockResolvedValue(ownLabel);
      labelRepo.getLabelStats.mockResolvedValue(null);

      await expect(
        labelService.getLabelStats(LABEL_ID, OWNER)
      ).resolves.toEqual({
        labelId: LABEL_ID,
        usageCount: 0,
        lastUsedAt: null,
      });
    });

    it("still returns the row when there is one", async () => {
      labelRepo.getById.mockResolvedValue(ownLabel);

      await expect(labelService.getById(LABEL_ID, OWNER)).resolves.toBe(
        ownLabel
      );
    });
  });

  describe("FlashcardDeckLabelService", () => {
    const ownLabel = { id: LABEL_ID, title: "Fıkıh", createdBy: OWNER };

    it("throws FlashcardDeckLabelNotFoundError instead of returning null from getById", async () => {
      deckLabelRepo.getById.mockResolvedValue(null);

      await expect(
        deckLabelService.getById(MISSING_ID, OWNER)
      ).rejects.toBeInstanceOf(FlashcardDeckLabelNotFoundError);
    });

    it("throws FlashcardDeckLabelNotFoundError from getDeckLabelStats when the LABEL is missing", async () => {
      deckLabelRepo.getById.mockResolvedValue(null);

      await expect(
        deckLabelService.getDeckLabelStats(MISSING_ID, OWNER)
      ).rejects.toBeInstanceOf(FlashcardDeckLabelNotFoundError);
      expect(deckLabelRepo.getLabelStats).not.toHaveBeenCalled();
    });

    it("answers a deck label that exists but was never applied with zero counts, not 404", async () => {
      deckLabelRepo.getById.mockResolvedValue(ownLabel);
      deckLabelRepo.getLabelStats.mockResolvedValue(null);

      await expect(
        deckLabelService.getDeckLabelStats(LABEL_ID, OWNER)
      ).resolves.toEqual({
        labelId: LABEL_ID,
        usageCount: 0,
        lastUsedAt: null,
      });
    });

    it("still returns the stats row when there is one", async () => {
      const stats = {
        labelId: LABEL_ID,
        usageCount: 3,
        lastUsedAt: new Date(),
      };
      deckLabelRepo.getById.mockResolvedValue(ownLabel);
      deckLabelRepo.getLabelStats.mockResolvedValue(stats);

      await expect(
        deckLabelService.getDeckLabelStats(LABEL_ID, OWNER)
      ).resolves.toBe(stats);
    });
  });
});
