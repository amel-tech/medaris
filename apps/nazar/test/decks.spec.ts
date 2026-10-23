import { describe, expect, it } from "vitest";
import {
  cardProblems,
  coverInitials,
  createDeckBody,
  type DeckFact,
  deckDraftOf,
  deckPatch,
  deckProblems,
  deckTotals,
  importFileProblem,
  importRowProblems,
  masteredPercent,
  newCardDraft,
} from "~/features/decks/decks";

const deck: DeckFact = {
  id: "d-1",
  title: "Nahiv Temelleri",
  description: null,
  cardType: "VOCABULARY",
  cardCount: 36,
  weekId: "w-1",
  weekNumber: 5,
  draft: false,
  masteredRatio: 0.62,
  enrolledCount: 12,
};

describe("the deck list", () => {
  it("reads the cover initials of at most two words", () => {
    expect(coverInitials("Nahiv Temelleri")).toBe("NT");
    expect(coverInitials("  Sarf  ")).toBe("S");
    expect(coverInitials("")).toBe("");
  });

  it("rounds the mastered share to a whole percent and clamps it", () => {
    expect(masteredPercent(0.62)).toBe(62);
    expect(masteredPercent(2)).toBe(100);
    expect(masteredPercent(-1)).toBe(0);
  });

  it("totals the decks, their cards and the course's talebe", () => {
    expect(deckTotals([deck, { ...deck, id: "d-2", cardCount: 4 }])).toEqual({
      decks: 2,
      cards: 40,
      students: 12,
    });
    expect(deckTotals([])).toEqual({ decks: 0, cards: 0, students: 0 });
  });
});

describe("the deck form", () => {
  it("asks for a title of 5 to 100 characters", () => {
    expect(deckProblems({ ...deckDraftOf(deck), title: "" }).title).toBe(
      "required"
    );
    expect(deckProblems({ ...deckDraftOf(deck), title: "abc" }).title).toBe(
      "length"
    );
    expect(deckProblems(deckDraftOf(deck))).toEqual({});
  });

  it("sends no empty description or week on create", () => {
    expect(
      createDeckBody({
        title: " Sarf ",
        description: "  ",
        cardType: "HADEETH",
        weekId: "",
        draft: true,
      })
    ).toEqual({ title: "Sarf", cardType: "HADEETH", draft: true });
  });

  it("sends only the keys that changed, and null for a cleared one", () => {
    expect(deckPatch(deck, deckDraftOf(deck))).toEqual({});
    expect(
      deckPatch(deck, { ...deckDraftOf(deck), weekId: "", draft: true })
    ).toEqual({ weekId: null, draft: true });
  });
});

describe("the card form", () => {
  it("asks for both faces of 3 to 5000 characters", () => {
    expect(cardProblems(newCardDraft("VOCABULARY"))).toEqual({
      contentFront: "required",
      contentBack: "required",
    });
    expect(
      cardProblems({
        type: "VOCABULARY",
        contentFront: "أهلاً",
        contentBack: "selam",
      })
    ).toEqual({});
  });
});

describe("the Excel import", () => {
  it("reads the rows of a 422 body, and nothing else", () => {
    expect(
      importRowProblems({
        context: {
          errors: [
            { row: 3, errors: [{ field: "contentBack", message: "boş" }] },
            { row: "x" },
          ],
        },
      })
    ).toEqual([{ row: 3, messages: ["boş"] }]);
    expect(importRowProblems(null)).toEqual([]);
  });

  it("accepts only .xlsx or .csv under 5 MB", () => {
    expect(importFileProblem({ name: "kartlar.xlsx", size: 10 })).toBeNull();
    expect(importFileProblem({ name: "kartlar.CSV", size: 10 })).toBeNull();
    expect(importFileProblem({ name: "kartlar.pdf", size: 10 })).toBe("type");
    expect(
      importFileProblem({ name: "kartlar.xlsx", size: 6 * 1024 * 1024 })
    ).toBe("size");
  });
});
