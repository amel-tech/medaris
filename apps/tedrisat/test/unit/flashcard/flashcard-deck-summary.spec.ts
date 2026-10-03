import { DeckPublishStatus } from "../../../src/flashcard/domain/deck-publish-status.enum";
import { FlashcardType } from "../../../src/flashcard/domain/flashcard-type.enum";
import {
  DeckCollectionKind,
  DeckSource,
} from "../../../src/flashcard/dto/flashcard-deck-summary-response.dto";
import { DeckNotFoundError } from "../../../src/flashcard/errors/deck-not-found.error";
import { DeckPublishStateError } from "../../../src/flashcard/errors/deck-publish-state.error";
import {
  FlashcardDeckService,
  normalizeTags,
} from "../../../src/flashcard/flashcard-deck.service";
import {
  DeckListRow,
  DeckProgressStats,
} from "../../../src/flashcard/flashcard-deck-summary.repository";
import {
  collectionKindOf,
  FlashcardDeckSummaryService,
  toDeckSummary,
} from "../../../src/flashcard/flashcard-deck-summary.service";

const ME = "me";

const row = (extra: Partial<DeckListRow> = {}): DeckListRow => ({
  id: "deck-1",
  title: "Mehmûz fiiller",
  description: null,
  authorId: ME,
  isPublic: false,
  cardType: FlashcardType.VOCABULARY,
  publishStatus: DeckPublishStatus.PRIVATE,
  publishRequestedAt: null,
  courseId: null,
  koskId: null,
  madrasahId: null,
  courseTitle: null,
  koskName: null,
  madrasahName: null,
  muderrisName: null,
  collectedAt: null,
  ...extra,
});

describe("toDeckSummary", () => {
  const stats = {
    cardCount: 18,
    masteredCount: 6,
    learningCount: 7,
    dueCount: 3,
    addedSinceCollectedCount: 4,
  };

  it("derives the new and due counts from the caller's progress", () => {
    const summary = toDeckSummary(row(), stats, ME);
    expect(summary).toMatchObject({
      cardCount: 18,
      masteredCount: 6,
      learningCount: 7,
      newCount: 5,
      dueCount: 3,
    });
  });

  it("answers a deck without cards with zeros, not with a missing row", () => {
    expect(toDeckSummary(row(), undefined, ME)).toMatchObject({
      cardCount: 0,
      masteredCount: 0,
      newCount: 0,
      dueCount: 0,
    });
  });

  it("marks the caller's own deck and zeroes what was added since collecting", () => {
    const summary = toDeckSummary(row({ collectedAt: new Date() }), stats, ME);
    expect(summary.isMine).toBe(true);
    expect(summary.source).toBe(DeckSource.OWN);
    expect(summary.collectionKind).toBeNull();
    expect(summary.addedSinceCollectedCount).toBe(0);
  });

  it("marks somebody else's deck as a collection entry with its origin", () => {
    const summary = toDeckSummary(
      row({
        authorId: "other",
        collectedAt: new Date(),
        courseId: "course-1",
        courseTitle: "Emsile ve Bina",
        muderrisName: "Abdülhamit",
      }),
      stats,
      ME
    );
    expect(summary).toMatchObject({
      isMine: false,
      source: DeckSource.COLLECTION,
      collectionKind: DeckCollectionKind.COURSE,
      inCollection: true,
      contextTitle: "Emsile ve Bina",
      muderrisName: "Abdülhamit",
      addedSinceCollectedCount: 4,
    });
  });

  it("names the köşk or the medrese and leaves the müderris out of them", () => {
    expect(
      toDeckSummary(
        row({
          authorId: "o",
          koskId: "k",
          koskName: "Nûruosmaniye Köşkü",
          muderrisName: "x",
        }),
        stats,
        ME
      )
    ).toMatchObject({
      collectionKind: DeckCollectionKind.KOSK,
      contextTitle: "Nûruosmaniye Köşkü",
      muderrisName: null,
    });
    expect(
      toDeckSummary(
        row({
          authorId: "o",
          madrasahId: "m",
          madrasahName: "Süleymaniye Medresesi",
        }),
        stats,
        ME
      )
    ).toMatchObject({
      collectionKind: DeckCollectionKind.MADRASAH,
      contextTitle: "Süleymaniye Medresesi",
    });
  });
});

describe("collectionKindOf", () => {
  it("prefers the most specific link and falls back to public", () => {
    const none = { courseId: null, koskId: null, madrasahId: null };
    expect(collectionKindOf({ ...none, koskId: "k", courseId: "c" })).toBe(
      DeckCollectionKind.COURSE
    );
    expect(collectionKindOf({ ...none, koskId: "k", madrasahId: "m" })).toBe(
      DeckCollectionKind.KOSK
    );
    expect(collectionKindOf(none)).toBe(DeckCollectionKind.PUBLIC);
  });
});

describe("FlashcardDeckSummaryService", () => {
  it("splits the explore answer where the first section ends", async () => {
    const repo = {
      findSharedWithCaller: vi
        .fn()
        .mockResolvedValue([row({ id: "a", authorId: "o" })]),
      findPublished: vi
        .fn()
        .mockResolvedValue([row({ id: "b", authorId: "o" }), row({ id: "c" })]),
      findStats: vi.fn().mockResolvedValue(new Map()),
    };
    const service = new FlashcardDeckSummaryService(repo as never);
    const result = await service.explore(ME, FlashcardType.HADEETH);
    expect(repo.findSharedWithCaller).toHaveBeenCalledWith(
      ME,
      FlashcardType.HADEETH
    );
    expect(result.courseDecks.map((d) => d.id)).toEqual(["a"]);
    expect(result.publicDecks.map((d) => d.id)).toEqual(["b", "c"]);
    expect(repo.findStats).toHaveBeenCalledWith(ME, ["a", "b", "c"]);
  });

  it("lists the caller's own decks before the collected ones", async () => {
    const repo = {
      findOwn: vi.fn().mockResolvedValue([row({ id: "own" })]),
      findCollected: vi
        .fn()
        .mockResolvedValue([row({ id: "col", authorId: "o" })]),
      findStats: vi.fn().mockResolvedValue(new Map()),
    };
    const service = new FlashcardDeckSummaryService(repo as never);
    const result = await service.summarize(ME);
    expect(result.map((d) => d.id)).toEqual(["own", "col"]);
  });

  describe("dueToday", () => {
    const serviceWith = (
      own: DeckListRow[],
      collected: DeckListRow[],
      stats: Record<string, Partial<DeckProgressStats>>
    ) => {
      const repo = {
        findOwn: vi.fn().mockResolvedValue(own),
        findCollected: vi.fn().mockResolvedValue(collected),
        findStats: vi.fn().mockResolvedValue(
          new Map(
            Object.entries(stats).map(([id, s]) => [
              id,
              {
                cardCount: 10,
                masteredCount: 0,
                learningCount: 0,
                dueCount: 0,
                addedSinceCollectedCount: 0,
                ...s,
              },
            ])
          )
        ),
      };
      return new FlashcardDeckSummaryService(repo as never);
    };

    it("lists decks with cards waiting first, the most waiting first, then decks that grew", async () => {
      const service = serviceWith(
        [row({ id: "few" }), row({ id: "many" }), row({ id: "quiet" })],
        [row({ id: "grown", authorId: "o", collectedAt: new Date() })],
        {
          few: { dueCount: 2 },
          many: { dueCount: 14 },
          grown: { addedSinceCollectedCount: 5 },
        }
      );
      expect((await service.dueToday(ME, 10)).map((d) => d.id)).toEqual([
        "many",
        "few",
        "grown",
      ]);
    });

    it("does not call a caller's own deck new just because it was never studied", async () => {
      const service = serviceWith([row({ id: "mine" })], [], {
        mine: { addedSinceCollectedCount: 9 },
      });
      expect(await service.dueToday(ME, 10)).toEqual([]);
    });

    it("stops at the limit", async () => {
      const service = serviceWith(
        [row({ id: "a" }), row({ id: "b" }), row({ id: "c" })],
        [],
        { a: { dueCount: 1 }, b: { dueCount: 2 }, c: { dueCount: 3 } }
      );
      expect((await service.dueToday(ME, 2)).map((d) => d.id)).toEqual([
        "c",
        "b",
      ]);
    });
  });
});

describe("normalizeTags", () => {
  it("trims, drops blanks and repeats, and keeps the order typed", () => {
    expect(normalizeTags([" sarf ", "", "Sarf", "nahiv", "  "])).toEqual([
      "sarf",
      "nahiv",
    ]);
  });

  it("compares Turkish capitals as Turkish", () => {
    expect(normalizeTags(["ILIK", "ılık"])).toEqual(["ILIK"]);
  });
});

describe("FlashcardDeckService publish request", () => {
  const deck = (publishStatus: DeckPublishStatus) => ({
    id: "d",
    publishStatus,
  });
  const build = (found: ReturnType<typeof deck> | null) => {
    const repo = {
      findById: vi.fn().mockResolvedValue(found),
      setPublishRequest: vi.fn().mockImplementation((_id, status, at) => ({
        id: "d",
        publishStatus: status,
        publishRequestedAt: at,
      })),
      update: vi.fn().mockResolvedValue({
        id: "d",
        publishStatus: DeckPublishStatus.PRIVATE,
      }),
    };
    return { repo, service: new FlashcardDeckService(repo as never) };
  };

  it("moves a private deck to PENDING with the time", async () => {
    const { repo, service } = build(deck(DeckPublishStatus.PRIVATE));
    const result = await service.requestPublish("d");
    expect(repo.setPublishRequest).toHaveBeenCalledWith(
      "d",
      DeckPublishStatus.PENDING,
      expect.any(Date)
    );
    expect(result.publishStatus).toBe(DeckPublishStatus.PENDING);
  });

  it("refuses to ask twice, or for a public deck", async () => {
    for (const status of [
      DeckPublishStatus.PENDING,
      DeckPublishStatus.PUBLISHED,
    ]) {
      const { repo, service } = build(deck(status));
      await expect(service.requestPublish("d")).rejects.toThrow(
        DeckPublishStateError
      );
      expect(repo.setPublishRequest).not.toHaveBeenCalled();
    }
  });

  it("withdraws a pending request without touching visibility", async () => {
    const { repo, service } = build(deck(DeckPublishStatus.PENDING));
    await service.withdrawPublish("d");
    expect(repo.setPublishRequest).toHaveBeenCalledWith(
      "d",
      DeckPublishStatus.PRIVATE,
      null
    );
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("takes a published deck private through the one write that keeps both columns in step", async () => {
    const { repo, service } = build(deck(DeckPublishStatus.PUBLISHED));
    await service.withdrawPublish("d");
    expect(repo.update).toHaveBeenCalledWith("d", { isPublic: false });
  });

  it("has nothing to withdraw on a private deck, and 404s a missing one", async () => {
    await expect(
      build(deck(DeckPublishStatus.PRIVATE)).service.withdrawPublish("d")
    ).rejects.toThrow(DeckPublishStateError);
    await expect(build(null).service.withdrawPublish("d")).rejects.toThrow(
      DeckNotFoundError
    );
    await expect(build(null).service.requestPublish("d")).rejects.toThrow(
      DeckNotFoundError
    );
  });
});
