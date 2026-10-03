import { ResponseError } from "@medaris/services/tedrisat";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getFlashcardDeckById: vi.fn(),
  getFlashcardByDeckId: vi.fn(),
  getFlashcardDeckSummaries: vi.fn(),
  exploreFlashcardDecks: vi.fn(),
}));
vi.mock("@medaris/services/tedrisat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@medaris/services/tedrisat")>()),
  createServerTedrisatAPIs: async () => ({
    decks: api,
    cards: api,
  }),
}));
vi.mock("~/lib/auth_options", () => ({ getAccessToken: async () => "token" }));

const answer = (status: number) =>
  new ResponseError(new Response(null, { status }), "refused");

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("what a deck read means (designs tedris/28, 29, 31, 38, 39)", () => {
  it("returns the deck with its cards, asking for the caller's progress", async () => {
    api.getFlashcardDeckById.mockResolvedValue({ id: "d1" });
    api.getFlashcardByDeckId.mockResolvedValue([{ id: "c1" }]);
    const { readDeck } = await import("~/features/flashcards/reads");
    expect(await readDeck("d1")).toEqual({
      status: "ok",
      deck: { id: "d1" },
      cards: [{ id: "c1" }],
    });
    expect(api.getFlashcardByDeckId).toHaveBeenCalledWith({
      deckId: "d1",
      include: ["progress"],
    });
  });

  it.each([
    404, 400,
  ])("the API's %i is a deck that is not there: the not-found page", async (status) => {
    api.getFlashcardDeckById.mockRejectedValue(answer(status));
    api.getFlashcardByDeckId.mockResolvedValue([]);
    const { readDeck } = await import("~/features/flashcards/reads");
    expect(await readDeck("d1")).toEqual({ status: "missing" });
  });

  it("the API's 403 is kept apart: the unavailable page", async () => {
    api.getFlashcardDeckById.mockResolvedValue({});
    api.getFlashcardByDeckId.mockRejectedValue(answer(403));
    const { readDeck } = await import("~/features/flashcards/reads");
    expect(await readDeck("d1")).toEqual({ status: "forbidden" });
  });

  it.each([
    500, 503,
  ])("the API's %i is a failure to ask: it throws, so the error page answers", async (status) => {
    api.getFlashcardDeckById.mockRejectedValue(answer(status));
    api.getFlashcardByDeckId.mockResolvedValue([]);
    const { readDeck } = await import("~/features/flashcards/reads");
    await expect(readDeck("d1")).rejects.toBeInstanceOf(ResponseError);
  });

  it("a list that cannot be read is null, so the page can offer a retry", async () => {
    api.getFlashcardDeckSummaries.mockRejectedValue(new Error("down"));
    api.exploreFlashcardDecks.mockRejectedValue(new Error("down"));
    const { getDeckSummaries, getDeckExplore } = await import(
      "~/features/flashcards/reads"
    );
    expect(await getDeckSummaries()).toBeNull();
    expect(await getDeckExplore("HADEETH")).toBeNull();
    expect(api.exploreFlashcardDecks).toHaveBeenCalledWith({
      cardType: "HADEETH",
    });
  });

  it("the copy picker lists only the caller's own decks, and none when they cannot be read", async () => {
    api.getFlashcardDeckSummaries.mockResolvedValue([
      { id: "a", isMine: true },
      { id: "b", isMine: false },
    ]);
    const { getOwnDecks } = await import("~/features/flashcards/reads");
    expect(await getOwnDecks()).toEqual([{ id: "a", isMine: true }]);
    api.getFlashcardDeckSummaries.mockRejectedValue(new Error("down"));
    expect(await getOwnDecks()).toEqual([]);
  });
});
