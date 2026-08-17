import { Test, TestingModule } from "@nestjs/testing";
import { DatabaseService } from "../../../src/database/database.service";
import { FlashcardRepository } from "../../../src/flashcard/flashcard.repository";

/**
 * MDRS-37. `createMany` used to hand its argument straight to
 * `insert(...).values(cards)`; an empty array compiles to invalid SQL, so the
 * repository was only ever safe because of what its callers happened to do.
 *
 * Unlike the example repository specs next door, this mounts the REAL
 * repository and mocks only `DatabaseService` — mocking the class under test
 * would assert nothing about the guard.
 */
describe("FlashcardRepository.createMany", () => {
  let repository: FlashcardRepository;

  const returning = vi.fn();
  const values = vi.fn(() => ({ returning }));
  const insert = vi.fn(() => ({ values }));

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlashcardRepository,
        { provide: DatabaseService, useValue: { db: { insert } } },
      ],
    }).compile();

    repository = module.get<FlashcardRepository>(FlashcardRepository);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resolves to an empty array without touching the database", async () => {
    const result = await repository.createMany([]);

    expect(result).toEqual([]);
    expect(insert).not.toHaveBeenCalled();
    expect(values).not.toHaveBeenCalled();
    expect(returning).not.toHaveBeenCalled();
  });

  it("still issues the insert for a non-empty batch", async () => {
    const cards = [
      {
        deckId: "623fdf08-fd0e-481b-a927-4a1c15135e62",
        authorId: "623fdf08-fd0e-481b-a927-4a1c15135e62",
        type: "VOCABULARY",
        contentFront: "أهلاً",
        contentBack: "selam",
      },
    ] as Parameters<FlashcardRepository["createMany"]>[0];
    returning.mockResolvedValue(cards);

    const result = await repository.createMany(cards);

    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(cards);
    expect(result).toBe(cards);
  });
});
