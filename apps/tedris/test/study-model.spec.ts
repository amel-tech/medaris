import type {
  EnrolledCourseResponse,
  FlashcardResponse,
} from "@medaris/services/tedrisat";
import { describe, expect, it } from "vitest";
import { dueNow } from "~/features/flashcards/deck-model";
import {
  ANONYMOUS_ROUND,
  anonymousRound,
  roundPercent,
  subtitleKind,
} from "~/features/flashcards/study-model";
import {
  CONTINUE_LIMIT,
  coursesToContinue,
  deckLine,
} from "~/features/home/model";
import { isPublicPath } from "~/lib/public-paths";

const DECK = "4b1f7c1e-8d2a-4a56-9f3b-0c6d5e7a8b90";

describe("the visitor's round (design tedris/32)", () => {
  const cards = Array.from({ length: 25 }, (_, i) => ({
    id: `c${i}`,
  })) as FlashcardResponse[];

  it("is the first cards of the deck, in its order", () => {
    const round = anonymousRound(cards);
    expect(round).toHaveLength(ANONYMOUS_ROUND);
    expect(round.map((c) => c.id)).toEqual(
      cards.slice(0, ANONYMOUS_ROUND).map((c) => c.id)
    );
  });

  it("is all of a short deck", () => {
    expect(anonymousRound(cards.slice(0, 3))).toHaveLength(3);
    expect(anonymousRound([])).toEqual([]);
  });
});

describe("what the study screen prints", () => {
  it("rounds the share of the round done and never divides by nothing", () => {
    expect(roundPercent(2, 6)).toBe(33);
    expect(roundPercent(6, 6)).toBe(100);
    expect(roundPercent(9, 6)).toBe(100);
    expect(roundPercent(0, 0)).toBe(0);
  });

  it("names the subtitle by what the round is made of", () => {
    expect(subtitleKind(false, 4)).toBe("all");
    expect(subtitleKind(true, 4)).toBe("due");
    expect(subtitleKind(true, 0)).toBe("new");
  });
});

describe("dueNow: which cards wait for a repeat", () => {
  const NOW = new Date("2026-10-02T09:00:00Z");
  const card = (progress?: object): FlashcardResponse =>
    ({ id: "c", progress: progress ? [progress] : [] }) as never;

  it("counts a started card whose time has come, and a learning card that never got one", () => {
    expect(
      dueNow(
        [
          card({ status: "LEARNING", dueAt: new Date("2026-10-01T09:00:00Z") }),
          card({ status: "LEARNING", dueAt: null }),
          card({ status: "MASTERED", dueAt: new Date("2026-10-02T08:59:00Z") }),
        ],
        NOW
      )
    ).toBe(3);
  });

  it("leaves out a card that is not due yet, one marked by hand, and one not started", () => {
    expect(
      dueNow(
        [
          card({ status: "LEARNING", dueAt: new Date("2026-10-05T09:00:00Z") }),
          card({ status: "MASTERED", dueAt: null }),
          card({ status: "NEW", dueAt: null }),
          card(),
        ],
        NOW
      )
    ).toBe(0);
  });
});

describe("Ana sayfa: which courses to continue and what a deck waits with", () => {
  const course = (
    id: string,
    over: {
      status?: string;
      progress?: number;
      at?: string | null;
    } = {}
  ): EnrolledCourseResponse =>
    ({
      id,
      enrollment: {
        status: over.status ?? "ENROLLED",
        progress: over.progress ?? 10,
      },
      nextSession: over.at === null ? null : { at: over.at ?? "2026-10-10" },
    }) as never;

  it("keeps the ones in progress, soonest session first, those with none last", () => {
    const list = coursesToContinue([
      course("none", { at: null }),
      course("later", { at: "2026-10-12T18:00:00Z" }),
      course("done", { progress: 100 }),
      course("pending", { status: "PENDING" }),
      course("soon", { at: "2026-10-04T18:00:00Z" }),
    ]);
    expect(list.map((c) => c.id)).toEqual(["soon", "later", "none"]);
  });

  it("shows no more than three", () => {
    const many = Array.from({ length: 6 }, (_, i) => course(`c${i}`));
    expect(coursesToContinue(many)).toHaveLength(CONTINUE_LIMIT);
  });

  it("says cards to repeat when there are some, new cards otherwise", () => {
    expect(deckLine({ dueCount: 6, addedSinceCollectedCount: 5 })).toEqual({
      kind: "due",
      count: 6,
    });
    expect(deckLine({ dueCount: 0, addedSinceCollectedCount: 5 })).toEqual({
      kind: "added",
      count: 5,
    });
  });
});

describe("the deck pages a visitor may open (MDRS-165)", () => {
  it("opens a deck and its study page by id, in every locale", () => {
    expect(isPublicPath(`/decks/${DECK}`)).toBe(true);
    expect(isPublicPath(`/tr/decks/${DECK}`)).toBe(true);
    expect(isPublicPath(`/en/decks/study/${DECK}`)).toBe(true);
  });

  it("keeps everything else under /decks behind the sign-in", () => {
    for (const path of [
      "/decks",
      "/tr/decks",
      "/tr/decks/create",
      "/tr/decks/explore",
      "/tr/decks/study",
      `/tr/decks/${DECK}/edit`,
      `/tr/decks/${DECK}/cards`,
      `/tr/decks/study/${DECK}/x`,
      "/tr/decks/not-an-id",
    ]) {
      expect(isPublicPath(path)).toBe(false);
    }
  });
});
