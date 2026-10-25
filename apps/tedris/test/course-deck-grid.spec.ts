// @vitest-environment happy-dom
import type { CourseDeckStudentResponse } from "@medaris/services/tedrisat";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cardRow } from "./decks-harness";
import { cleanup, click, render, settle } from "./dom";
import { nasaraMazi } from "./siga-fixture";

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
const rateFlashcard = vi.fn();
vi.mock("~/features/flashcards/actions", () => ({
  getDeckCards: (id: string) => getDeckCards(id),
  rateFlashcard: (id: string, rating: string) => rateFlashcard(id, rating),
}));

beforeEach(() => {
  getDeckCards.mockReset();
  rateFlashcard.mockReset();
  rateFlashcard.mockResolvedValue({ success: true, data: [] });
  getDeckCards.mockImplementation(async (id: string) => ({
    success: true,
    data:
      id === "a"
        ? Array.from({ length: 6 }, (_, i) => cardRow(i + 1))
        : id === "siga"
          ? nasaraMazi()
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

const mount = async (
  decks = [deck("a", "Mehmûz fiiller"), deck("b", "İsimler")]
) => {
  const { CourseDecksTab } = await import(
    "~/features/courses/components/course-decks-tab"
  );
  return render(
    createElement(CourseDecksTab, {
      decks,
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
  [...document.querySelectorAll("ul button[data-card-id]")] as HTMLElement[];
const isTurned = (card: Element) => card.hasAttribute("data-turned");

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
    expect(cards.some(isTurned)).toBe(false);
    const [front, back] = cards[0].querySelectorAll("[aria-hidden]");
    expect(front.getAttribute("aria-hidden")).toBe("false");
    // The side is read out, never shown: colour tells it on screen.
    expect(front.textContent).toBe("Ön yüzأَخَذَ 1");
    expect(front.querySelector(".mds-visually-hidden")?.textContent).toBe(
      "Ön yüz"
    );
    expect(front.className).toContain("bg-brand-bold");
    expect(front.className).toContain("text-neutral-on-bold");
    expect(back.className).toContain("bg-neutral-surface");
    expect(back.getAttribute("aria-hidden")).toBe("true");
    expect(front.querySelector("[lang='ar']")?.getAttribute("dir")).toBe("rtl");
  });

  it("turns a card over on a press and back on the next, one card at a time", async () => {
    await mount();
    await click(chip("Kartlar"));
    await settle();
    const [first, second] = gridCards();
    await click(first);
    expect(isTurned(first)).toBe(true);
    // A plain button, not a toggle: its name changes with the side.
    expect(first.hasAttribute("aria-pressed")).toBe(false);
    // Lifted and shadowed while it turns.
    expect(first.hasAttribute("data-turning")).toBe(true);
    const [front, back] = first.querySelectorAll("[aria-hidden]");
    expect(front.getAttribute("aria-hidden")).toBe("true");
    expect(back.getAttribute("aria-hidden")).toBe("false");
    expect(back.textContent).toBe("Arka yüzAldı 1");
    expect(isTurned(second)).toBe(false);
    await click(first);
    expect(isTurned(first)).toBe(false);
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

const sigaDeck = () => [deck("siga", "نَصَرَ mâzî")];
const table = () => document.querySelector("table") as HTMLTableElement;
const cell = (row: number, column: number) =>
  table().querySelectorAll("tbody tr")[row].querySelectorAll("td")[column];
const allCards = () =>
  [...document.querySelectorAll("button[data-card-id]")] as HTMLElement[];

describe("Ders destesi, sîga tablosu", () => {
  it("lays a deck of sîgas out as a sarf table, not a free grid", async () => {
    await mount(sigaDeck());
    await click(chip("Kartlar"));
    await settle();
    expect(document.querySelector("ul button[data-card-id]")).toBeNull();
    expect(table().querySelector("caption")?.textContent).toContain("Mâzî");
    expect(
      [...table().querySelectorAll("thead th")].map((th) => th.textContent)
    ).toEqual(["Müfred", "Tesniye", "Cem"]);
    expect(
      [...table().querySelectorAll("tbody th")].map(
        (th) => th.querySelector("span")?.textContent
      )
    ).toEqual(["Gâib", "Gâibe", "Muhâtab", "Muhâtaba", "Mütekellim"]);
    expect(cell(0, 0).textContent).toContain("نَصَرَ");
    expect(cell(1, 2).textContent).toContain("نَصَرْنَ");
    expect(cell(4, 0).textContent).toContain("نَصَرْتُ");
    expect(cell(4, 1).querySelector("button")).toBeNull();
    expect(cell(4, 1).textContent).toBe("Bu sîga yok");
    expect(cell(4, 2).textContent).toContain("نَصَرْنَا");
    expect(allCards()).toHaveLength(14);
  });

  it("keeps the explicit table roles the narrow layout needs", async () => {
    await mount(sigaDeck());
    await click(chip("Kartlar"));
    await settle();
    expect(table().getAttribute("role")).toBe("table");
    expect(table().querySelectorAll("[role='rowheader']")).toHaveLength(5);
    expect(table().querySelectorAll("[role='columnheader']")).toHaveLength(3);
    // 15 card cells and the header row's corner, which keeps the columns
    // lined up at every width.
    expect(table().querySelectorAll("[role='cell']")).toHaveLength(16);
    const width = (tr: Element) => tr.children.length;
    const [head, ...body] = [...table().querySelectorAll("tr")];
    expect(body.every((tr) => width(tr) === width(head))).toBe(true);
    const caption = table().querySelector("caption") as HTMLElement;
    expect(table().getAttribute("aria-labelledby")).toBe(caption.id);
  });
});

describe("Ders destesi, kendini sına", () => {
  const start = async () => {
    await mount(sigaDeck());
    await click(chip("Kartlar"));
    await settle();
    await click(chip("Kendini sına"));
  };
  const markAs = async (card: HTMLElement, label: string) => {
    await click(card);
    const box = card.parentElement as HTMLElement;
    await click(
      [...box.querySelectorAll("button")].find(
        (b) => b.textContent === label
      ) as HTMLElement
    );
    await settle();
  };

  it("starts every card face down and asks only after a card is turned", async () => {
    await mount(sigaDeck());
    await click(chip("Kartlar"));
    await settle();
    await click(allCards()[0]);
    await click(chip("Kendini sına"));
    expect(allCards().some(isTurned)).toBe(false);
    expect(chip("Bildim")).toBeUndefined();
    expect(document.body.textContent).toContain("0 / 14 işaretlendi");
    await click(allCards()[0]);
    expect(chip("Bildim")).toBeDefined();
    expect(chip("Bilemedim")).toBeDefined();
  });

  it("rates a missed card hard and a known one easy", async () => {
    await start();
    const [first, second] = allCards();
    await markAs(first, "Bilemedim");
    await markAs(second, "Bildim");
    expect(rateFlashcard).toHaveBeenNthCalledWith(1, "s1", "HARD");
    expect(rateFlashcard).toHaveBeenNthCalledWith(2, "s2", "EASY");
    expect(document.body.textContent).toContain("Bilemedin");
    expect(document.body.textContent).toContain("Bildin");
    expect(document.body.textContent).toContain("2 / 14 işaretlendi");
    // The buttons that had focus are gone; the card keeps it.
    expect(document.activeElement).toBe(second);
  });

  it("sums the round up, and repeats the missed cards alone", async () => {
    await start();
    const cards = allCards();
    for (const [i, card] of cards.entries()) {
      await markAs(card, i < 3 ? "Bilemedim" : "Bildim");
    }
    expect(document.body.textContent).toContain(
      "14 kartın 11 tanesini bildin."
    );
    await click(chip("Bilemediklerimi tekrar et"));
    const again = allCards();
    expect(again).toHaveLength(3);
    expect(again.some(isTurned)).toBe(false);
    expect(document.body.textContent).toContain("0 / 3 işaretlendi");
    // The three missed cards are the gâib row: only that row is drawn.
    expect(
      [...table().querySelectorAll("tbody th")].map(
        (th) => th.querySelector("span")?.textContent
      )
    ).toEqual(["Gâib"]);
    expect(document.activeElement).toBe(again[0]);
  });

  it("writes the summary into a live region that was there before it", async () => {
    await start();
    const live = [...document.querySelectorAll("[aria-live]")].find((el) =>
      el.classList.contains("mds-visually-hidden")
    ) as HTMLElement;
    expect(live.textContent).toBe("");
    for (const card of allCards()) await markAs(card, "Bildim");
    expect(live.textContent).toBe("14 kartın 14 tanesini bildin.");
    await click(chip("Bitir"));
    expect(document.activeElement).toBe(chip("Kendini sına"));
  });

  it("says when a mark could not be saved, and keeps the mark", async () => {
    rateFlashcard.mockResolvedValueOnce({ success: false, error: "boom" });
    await start();
    await markAs(allCards()[0], "Bildim");
    expect(document.body.textContent).toContain("Bazı işaretler kaydedilemedi");
    expect(document.body.textContent).toContain("1 / 14 işaretlendi");
    await click(chip("Yeniden gönder"));
    await settle();
    expect(rateFlashcard).toHaveBeenNthCalledWith(2, "s1", "EASY");
    expect(document.body.textContent).not.toContain(
      "Bazı işaretler kaydedilemedi"
    );
  });

  it("drops a failed rating that answers after the test was stopped", async () => {
    let fail: (value: unknown) => void = () => undefined;
    rateFlashcard.mockReturnValueOnce(
      new Promise((resolve) => {
        fail = resolve;
      })
    );
    await start();
    await markAs(allCards()[0], "Bildim");
    await click(chip("Sınamayı bitir"));
    fail({ success: false, error: "late" });
    await settle();
    expect(document.body.textContent).not.toContain(
      "Bazı işaretler kaydedilemedi"
    );
  });

  it("goes back to browsing when the test is stopped", async () => {
    await start();
    await click(allCards()[0]);
    await click(chip("Sınamayı bitir"));
    expect(chip("Bildim")).toBeUndefined();
    expect(allCards()).toHaveLength(14);
    expect(document.body.textContent).toContain("14 kart");
    expect(document.activeElement).toBe(chip("Kendini sına"));
  });
});
