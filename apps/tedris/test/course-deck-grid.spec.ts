// @vitest-environment happy-dom
import type { CourseDeckStudentResponse } from "@medaris/services/tedrisat";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cardRow } from "./decks-harness";
import { cleanup, click, render, settle } from "./dom";

vi.mock("next-intl", async (importOriginal) => {
  const real = await importOriginal<typeof import("next-intl")>();
  const { translatorFor } = await import("./decks-harness");
  return {
    ...real,
    useLocale: () => "tr",
    useTranslations: (ns: string) => translatorFor(real.createTranslator, ns),
  };
});
const getDeckCards = vi.fn();
vi.mock("~/features/flashcards/actions", () => ({
  getDeckCards: (id: string) => getDeckCards(id),
}));

beforeEach(() => {
  getDeckCards.mockReset();
  getDeckCards.mockImplementation(async (id: string) => ({
    success: true,
    data:
      id === "a"
        ? Array.from({ length: 6 }, (_, i) => cardRow(i + 1))
        : [
            cardRow(7, undefined, {
              contentFront: "kitap",
              contentBack: "book",
            }),
          ],
  }));
});
afterEach(cleanup);

const deck = (id: string, title: string): CourseDeckStudentResponse => ({
  id,
  title,
  description: null,
  cardType: "VOCABULARY",
  weekId: null,
  weekNumber: null,
  cardCount: 6,
  masteredCount: 0,
  learningCount: 0,
  newCount: 6,
  dueCount: 0,
});

const mount = async () => {
  const { CourseDecksTab } = await import(
    "~/features/courses/components/course-decks-tab"
  );
  return render(
    createElement(CourseDecksTab, {
      decks: [deck("a", "Mehmûz fiiller"), deck("b", "İsimler")],
      course: { weeks: [] },
      now: Date.parse("2026-10-03T09:00:00Z"),
    })
  );
};

const chip = (label: string) =>
  [...document.querySelectorAll("button")].find(
    (b) => b.textContent === label
  ) as HTMLButtonElement;
const gridCards = () =>
  [...document.querySelectorAll("ul button[aria-pressed]")] as HTMLElement[];

describe("Ders destesi, kart ızgarası", () => {
  it("opens on the deck list, and reads no card until the grid is asked for", async () => {
    await mount();
    expect(chip("Desteler").getAttribute("aria-pressed")).toBe("true");
    expect(document.body.textContent).toContain("Mehmûz fiiller");
    expect(gridCards()).toHaveLength(0);
    expect(getDeckCards).not.toHaveBeenCalled();
  });

  it("shows every card of the first deck at once, front up", async () => {
    await mount();
    await click(chip("Kartlar"));
    await settle();
    expect(getDeckCards).toHaveBeenCalledWith("a");
    const cards = gridCards();
    expect(cards).toHaveLength(6);
    expect(document.body.textContent).toContain("6 kart");
    expect(cards.every((c) => c.getAttribute("aria-pressed") === "false")).toBe(
      true
    );
    const [front, back] = cards[0].querySelectorAll("[aria-hidden]");
    expect(front.getAttribute("aria-hidden")).toBe("false");
    expect(front.textContent).toBe("Ön yüzأَخَذَ 1");
    expect(back.getAttribute("aria-hidden")).toBe("true");
    expect(front.querySelector("[lang='ar']")?.getAttribute("dir")).toBe("rtl");
  });

  it("turns a card over on a press and back on the next, one card at a time", async () => {
    await mount();
    await click(chip("Kartlar"));
    await settle();
    const [first, second] = gridCards();
    await click(first);
    expect(first.getAttribute("aria-pressed")).toBe("true");
    const [front, back] = first.querySelectorAll("[aria-hidden]");
    expect(front.getAttribute("aria-hidden")).toBe("true");
    expect(back.getAttribute("aria-hidden")).toBe("false");
    expect(back.textContent).toBe("Arka yüzAldı 1");
    expect(second.getAttribute("aria-pressed")).toBe("false");
    await click(first);
    expect(first.getAttribute("aria-pressed")).toBe("false");
  });

  it("switches deck from the chips and reads each deck once", async () => {
    await mount();
    await click(chip("Kartlar"));
    await settle();
    await click(chip("İsimler"));
    await settle();
    expect(gridCards()).toHaveLength(1);
    expect(document.body.textContent).toContain("kitap");
    await click(chip("Mehmûz fiiller"));
    await settle();
    expect(gridCards()).toHaveLength(6);
    expect(getDeckCards).toHaveBeenCalledTimes(2);
  });

  it("says when the cards could not be read, and asks again on retry", async () => {
    getDeckCards.mockResolvedValueOnce({ success: false, error: "boom" });
    await mount();
    await click(chip("Kartlar"));
    await settle();
    expect(document.body.textContent).toContain(
      "Bu destenin kartları yüklenemedi."
    );
    await click(chip("Yeniden dene"));
    await settle();
    expect(gridCards()).toHaveLength(6);
    expect(getDeckCards).toHaveBeenCalledTimes(2);
  });

  it("goes back to the deck list", async () => {
    await mount();
    await click(chip("Kartlar"));
    await settle();
    await click(chip("Desteler"));
    expect(gridCards()).toHaveLength(0);
    expect(document.body.textContent).toContain("Mehmûz fiiller");
  });
});
