import type {
  CourseDeckStudentResponse,
  CourseDetailResponse,
} from "@medaris/services/tedrisat";
import { describe, expect, it } from "vitest";
import {
  type CourseDeck,
  deckRowStatus,
  gridDeckId,
  isDeckComplete,
  otherDecks,
  pickFeaturedDeck,
} from "~/features/courses/course-decks-model";

// 3 Ekim 2026 Cumartesi 12:00 İstanbul (UTC+3).
const NOW = Date.parse("2026-10-03T09:00:00Z");
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** A course of weeks 1..n, each with one held session at `at` (ms). */
const course = (
  sessions: Record<number, number | null>
): Pick<CourseDetailResponse, "weeks"> => ({
  weeks: Object.entries(sessions).map(([number, at]) => {
    const weekNumber = Number(number);
    const id = `w${weekNumber}`;
    return {
      id,
      courseId: "course",
      weekNumber,
      title: id,
      orderIndex: weekNumber,
      lessons:
        at === null
          ? []
          : [
              {
                id: `l${weekNumber}`,
                weekId: id,
                title: id,
                type: "LIVE",
                scheduledAt: new Date(at),
                durationMinutes: 60,
                cancelledAt: null,
                isPreview: false,
                orderIndex: 0,
                resources: [],
              },
            ],
    };
  }) as unknown as CourseDetailResponse["weeks"],
});

const deck = (
  id: string,
  week: number | null,
  extra: Partial<CourseDeckStudentResponse> = {}
): CourseDeck => ({
  id,
  title: `Deste ${id}`,
  description: null,
  cardType: "VOCABULARY",
  weekId: week === null ? null : `w${week}`,
  weekNumber: week,
  cardCount: 10,
  masteredCount: 0,
  learningCount: 0,
  newCount: 10,
  dueCount: 0,
  ...extra,
});

describe("isDeckComplete", () => {
  it("is done only when every card is mastered", () => {
    expect(isDeckComplete({ cardCount: 4, masteredCount: 4 })).toBe(true);
    expect(isDeckComplete({ cardCount: 4, masteredCount: 3 })).toBe(false);
  });

  it("is not done when it has no cards", () => {
    expect(isDeckComplete({ cardCount: 0, masteredCount: 0 })).toBe(false);
  });
});

describe("pickFeaturedDeck", () => {
  it("features a deck of the week of the next celse, and says it is this week's", () => {
    const c = course({ 1: NOW - 2 * DAY, 2: NOW + DAY, 3: NOW + 8 * DAY });
    const decks = [deck("a", 1), deck("b", 2), deck("c", 3)];
    const featured = pickFeaturedDeck(decks, c, NOW);
    expect(featured?.deck.id).toBe("b");
    expect(featured?.reason).toBe("thisWeek");
  });

  it("keeps the week of a celse on air until it is over", () => {
    const c = course({ 1: NOW - 2 * DAY, 2: NOW - 10 * MINUTE, 3: NOW + DAY });
    const decks = [deck("a", 2), deck("b", 3)];
    expect(pickFeaturedDeck(decks, c, NOW)?.deck.id).toBe("a");
  });

  it("among decks of the same week prefers one not done, then more cards to repeat", () => {
    const c = course({ 1: NOW + DAY });
    const decks = [
      deck("done", 1, { cardCount: 5, masteredCount: 5, dueCount: 9 }),
      deck("open-quiet", 1, { dueCount: 0 }),
      deck("open-due", 1, { dueCount: 3 }),
    ];
    expect(pickFeaturedDeck(decks, c, NOW)?.deck.id).toBe("open-due");
  });

  it("falls back to the lowest-week deck with cards to repeat, labelled next", () => {
    const c = course({ 1: NOW - 2 * DAY, 2: NOW + DAY });
    const decks = [
      deck("w4-due", 4, { dueCount: 2 }),
      deck("w3-open", 3),
      deck("w3-due", 3, { dueCount: 1 }),
    ];
    const featured = pickFeaturedDeck(decks, c, NOW);
    expect(featured?.deck.id).toBe("w3-due");
    expect(featured?.reason).toBe("next");
  });

  it("without cards to repeat, takes the lowest-week deck not done yet", () => {
    const c = course({ 1: NOW - 2 * DAY, 2: NOW + DAY });
    const decks = [
      deck("w1-done", 1, { cardCount: 2, masteredCount: 2 }),
      deck("w5", 5),
      deck("w3", 3),
    ];
    const featured = pickFeaturedDeck(decks, c, NOW);
    expect(featured?.deck.id).toBe("w3");
    expect(featured?.reason).toBe("next");
  });

  it("features nothing when every deck is done or there are none", () => {
    const c = course({ 1: NOW + DAY });
    expect(pickFeaturedDeck([], c, NOW)).toBeNull();
    expect(
      pickFeaturedDeck(
        [deck("a", 2, { cardCount: 1, masteredCount: 1 })],
        c,
        NOW
      )
    ).toBeNull();
  });

  it("without any session ahead, skips the week tier and takes the cards-to-repeat deck", () => {
    const c = course({ 1: NOW - 3 * DAY, 2: null });
    const decks = [deck("a", 1, { dueCount: 1 })];
    const featured = pickFeaturedDeck(decks, c, NOW);
    expect(featured?.deck.id).toBe("a");
    expect(featured?.reason).toBe("next");
  });
});

describe("otherDecks and deckRowStatus", () => {
  it("lists every deck but the featured one, in the API's order", () => {
    const decks = [deck("a", 1), deck("b", 2), deck("c", 3)];
    const featured = { deck: decks[1], reason: "thisWeek" as const };
    expect(otherDecks(decks, featured).map((d) => d.id)).toEqual(["a", "c"]);
    expect(otherDecks(decks, null)).toHaveLength(3);
  });

  it("names a row done, due, or to start", () => {
    expect(
      deckRowStatus(deck("a", 1, { cardCount: 3, masteredCount: 3 }))
    ).toBe("done");
    expect(deckRowStatus(deck("b", 1, { dueCount: 4, masteredCount: 2 }))).toBe(
      "due"
    );
    expect(deckRowStatus(deck("c", 1))).toBe("start");
  });
});

describe("gridDeckId", () => {
  it("opens the card grid on the featured deck", () => {
    const decks = [deck("a", 1), deck("b", 2)];
    expect(gridDeckId(decks, { deck: decks[1], reason: "next" })).toBe("b");
  });

  it("falls back to the API's first deck, and to none without decks", () => {
    expect(gridDeckId([deck("a", 1), deck("b", 2)], null)).toBe("a");
    expect(gridDeckId([], null)).toBeNull();
  });
});
