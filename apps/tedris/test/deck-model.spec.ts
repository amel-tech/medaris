import type {
  FlashcardDeckSummaryResponse,
  FlashcardResponse,
} from "@medaris/services/tedrisat";
import { describe, expect, it } from "vitest";
import {
  countCards,
  dayAndMonth,
  faceProblem,
  filterMyDecks,
  fullDateTime,
  importRowErrors,
  isArabic,
  kindOf,
  matchesQuery,
  parseTags,
  percentOf,
  READER_PAGE,
  showMore,
  sourceOf,
  splitDecks,
  tagsProblem,
  titleProblem,
  unchanged,
} from "~/features/flashcards/deck-model";

const deck = (
  over: Partial<FlashcardDeckSummaryResponse> = {}
): FlashcardDeckSummaryResponse =>
  ({
    id: "d1",
    title: "Mehmûz fiiller",
    description: "Hemzeli fiillerin çekimleri.",
    authorId: "me",
    isMine: true,
    cardType: "VOCABULARY",
    publishStatus: "PRIVATE",
    publishRequestedAt: null,
    source: "OWN",
    collectionKind: null,
    inCollection: false,
    contextTitle: null,
    muderrisName: null,
    cardCount: 18,
    masteredCount: 6,
    learningCount: 7,
    newCount: 5,
    dueCount: 7,
    addedSinceCollectedCount: 0,
    ...over,
  }) as FlashcardDeckSummaryResponse;

const card = (status?: string): FlashcardResponse =>
  ({
    id: Math.random().toString(),
    deckId: "d1",
    authorId: "me",
    type: "VOCABULARY",
    contentFront: "x",
    contentBack: "y",
    progress: status ? [{ userId: "me", flashcardId: "c", status }] : [],
  }) as unknown as FlashcardResponse;

describe("the Desteler filter and search (design tedris/25)", () => {
  const list = [
    deck({ id: "a", title: "Mehmûz fiiller", publishStatus: "PENDING" }),
    deck({ id: "b", title: "Bina’dan kelimeler", publishStatus: "PRIVATE" }),
    deck({
      id: "c",
      title: "Emsile çekimleri",
      publishStatus: "PUBLISHED",
      description: null,
    }),
  ];

  it("the status filter keeps only that status, 'all' keeps every deck", () => {
    expect(filterMyDecks(list, "PENDING").map((d) => d.id)).toEqual(["a"]);
    expect(filterMyDecks(list, "PRIVATE").map((d) => d.id)).toEqual(["b"]);
    expect(filterMyDecks(list, "PUBLISHED").map((d) => d.id)).toEqual(["c"]);
    expect(filterMyDecks(list, "all")).toHaveLength(3);
  });

  it("the search matches every word, in the name or the description, in Turkish case", () => {
    expect(matchesQuery(list[0], "")).toBe(true);
    expect(matchesQuery(list[0], "  ")).toBe(true);
    expect(matchesQuery(list[0], "MEHMÛZ")).toBe(true);
    expect(matchesQuery(list[0], "hemzeli fiil")).toBe(true);
    expect(matchesQuery(list[0], "hemzeli nahiv")).toBe(false);
    // The Turkish dotted and dotless i: "I" lowercases to "ı".
    expect(matchesQuery({ title: "Istılahlar" }, "ıstılah")).toBe(true);
    expect(matchesQuery({ title: "İstılahlar" }, "istılah")).toBe(true);
  });

  it("filter and search combine", () => {
    expect(filterMyDecks(list, "PRIVATE", "mehmûz")).toEqual([]);
    expect(filterMyDecks(list, "all", "emsile").map((d) => d.id)).toEqual([
      "c",
    ]);
  });

  it("splits the one answer into the caller's decks and the collected ones", () => {
    const { mine, collected } = splitDecks([
      deck({ id: "m" }),
      deck({ id: "k", isMine: false }),
    ]);
    expect(mine.map((d) => d.id)).toEqual(["m"]);
    expect(collected.map((d) => d.id)).toEqual(["k"]);
  });
});

describe("percentages and status counts (designs tedris/25, 28, 31)", () => {
  it("rounds to a whole percent and never divides by nothing", () => {
    expect(percentOf(30, 36)).toBe(83);
    expect(percentOf(6, 18)).toBe(33);
    expect(percentOf(12, 40)).toBe(30);
    expect(percentOf(0, 0)).toBe(0);
    expect(percentOf(5, 4)).toBe(100);
  });

  it("a card with no progress row is new, and the three counts are the whole deck", () => {
    const cards = [
      card("MASTERED"),
      card("MASTERED"),
      card("LEARNING"),
      card(),
      card("NEW"),
      card(undefined),
    ];
    const counts = countCards(cards);
    expect(counts).toEqual({ total: 6, new: 3, learning: 1, mastered: 2 });
    expect(counts.new + counts.learning + counts.mastered).toBe(counts.total);
    expect(countCards([])).toEqual({
      total: 0,
      new: 0,
      learning: 0,
      mastered: 0,
    });
  });

  it("'Daha fazla göster' adds six and stops at the total", () => {
    expect(showMore(6, 40)).toBe(12);
    expect(showMore(36, 40)).toBe(40);
    expect(showMore(6, 8)).toBe(8);
    expect(READER_PAGE).toBe(6);
  });
});

describe("the create form's rules (design tedris/27)", () => {
  it("splits tags on commas, trims, drops blanks and repeats, keeps the order", () => {
    expect(parseTags(" sarf , nahiv,, Sarf ,  ")).toEqual(["sarf", "nahiv"]);
    expect(parseTags("")).toEqual([]);
    expect(parseTags("ILIK, ılık")).toEqual(["ILIK"]);
    expect(parseTags("a،b")).toEqual(["a", "b"]);
  });

  it("refuses more than twenty tags or a tag past forty characters", () => {
    expect(tagsProblem(parseTags("a,b"))).toBeNull();
    expect(
      tagsProblem(
        parseTags(Array.from({ length: 21 }, (_, i) => `t${i}`).join(","))
      )
    ).toBe("tooMany");
    expect(tagsProblem(["x".repeat(41)])).toBe("tooLong");
  });

  it("the name is required and at least five characters, as the API takes it", () => {
    expect(titleProblem("")).toBe("required");
    expect(titleProblem("   ")).toBe("required");
    expect(titleProblem("abcd")).toBe("tooShort");
    expect(titleProblem(" abcde ")).toBeNull();
    expect(titleProblem("x".repeat(101))).toBe("tooLong");
  });

  it("an edit that changes nothing is recognised, spaces aside", () => {
    const stored = { title: "Mehmûz fiiller", description: null };
    expect(
      unchanged(stored, { title: " Mehmûz fiiller ", description: "" })
    ).toBe(true);
    expect(
      unchanged(stored, { title: "Mehmûz fiiller", description: "x" })
    ).toBe(false);
    expect(
      unchanged(
        { title: "A", description: "b" },
        { title: "A", description: "b " }
      )
    ).toBe(true);
  });

  it("a card face needs three characters", () => {
    expect(faceProblem("")).toBe("required");
    expect(faceProblem("ab")).toBe("tooShort");
    expect(faceProblem("abc")).toBeNull();
    expect(faceProblem("x".repeat(5001))).toBe("tooLong");
  });
});

describe("dates (designs tedris/25, 28)", () => {
  const requested = new Date("2026-09-29T18:10:00Z");

  it("writes the card's date with the Turkish ending of its month", () => {
    expect(dayAndMonth(requested, "tr", "Europe/Istanbul")).toBe("29 Eylül’de");
    expect(
      dayAndMonth(new Date("2026-01-05T09:00:00Z"), "tr", "Europe/Istanbul")
    ).toBe("5 Ocak’ta");
    expect(
      dayAndMonth(new Date("2026-04-05T09:00:00Z"), "tr", "Europe/Istanbul")
    ).toBe("5 Nisan’da");
    expect(dayAndMonth(requested, "en", "Europe/Istanbul")).toBe(
      "29 September"
    );
  });

  it("takes the day in the viewer's zone, not the server's", () => {
    // 21:30 UTC on the 30th is 00:30 on 1 October in Istanbul.
    expect(
      dayAndMonth(new Date("2026-09-30T21:30:00Z"), "tr", "Europe/Istanbul")
    ).toBe("1 Ekim’de");
    expect(dayAndMonth(new Date("2026-09-30T21:30:00Z"), "tr", "UTC")).toBe(
      "30 Eylül’de"
    );
  });

  it("writes the request time with its weekday: 29 Eylül 2026 Salı 21:10", () => {
    expect(fullDateTime(requested, "tr", "Europe/Istanbul")).toBe(
      "29 Eylül 2026 Salı 21:10"
    );
  });
});

describe("card faces and sources (designs tedris/28, 29, 31)", () => {
  it("knows Arabic script from Latin", () => {
    expect(isArabic("أَخَذَ يَأْخُذُ")).toBe(true);
    expect(isArabic("Aldı, alır")).toBe(false);
    expect(isArabic("Emri خذ: hemze düşer")).toBe(true);
  });

  it("reads the source line from a card's meta, if it has one", () => {
    const withMeta = (contentMeta: unknown) =>
      ({ ...card(), contentMeta }) as FlashcardResponse;
    expect(sourceOf(withMeta({ source: "Buhârî, Müslim" }))).toBe(
      "Buhârî, Müslim"
    );
    expect(sourceOf(withMeta({ source: " " }))).toBeNull();
    expect(sourceOf(withMeta({ source: 3 }))).toBeNull();
    expect(sourceOf(withMeta(undefined))).toBeNull();
    expect(sourceOf(withMeta({}))).toBeNull();
  });

  it("a deck's kind is its card type", () => {
    expect(kindOf({ cardType: "HADEETH" })).toBe("HADEETH");
    expect(kindOf({ cardType: "VOCABULARY" })).toBe("VOCABULARY");
  });
});

describe("the import's refusal (design tedris/29)", () => {
  it("reads each bad row and its messages out of the 422 body", () => {
    expect(
      importRowErrors({
        context: {
          errors: [
            {
              row: 2,
              errors: [
                { field: "type", message: "type must be a valid enum value" },
                { field: "contentFront", message: "too short" },
              ],
            },
            { row: 5, errors: [] },
          ],
        },
      })
    ).toEqual([
      { row: 2, messages: ["type must be a valid enum value", "too short"] },
      { row: 5, messages: [] },
    ]);
  });

  it("answers nothing for a body of any other shape", () => {
    expect(importRowErrors(null)).toEqual([]);
    expect(importRowErrors({})).toEqual([]);
    expect(importRowErrors({ context: { errors: "x" } })).toEqual([]);
    expect(importRowErrors({ context: { errors: [{ row: "a" }] } })).toEqual(
      []
    );
  });
});
