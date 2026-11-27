// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { act, createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewItem } from "~/features/online-exams/components/answer-review";
import { cleanup, click, key, render } from "./dom";
import { intlMock } from "./intl-mock";

/**
 * The answers of a finished çalışma attempt and of a past exam (MDRS-248):
 * the numbered strip, the filter and the narrow cards, shared by both.
 */

vi.mock("next-intl", async (orig) => intlMock(await orig()));
// The note icon's Server Actions (soru notları), never called here.
vi.mock("~/features/question-notes/actions", () => ({
  saveMyQuestionNote: vi.fn(),
  deleteMyQuestionNote: vi.fn(),
}));

const OUTCOMES = ["correct", "wrong", "blank"] as const;
const item = (n: number, over: Partial<ReviewItem> = {}): ReviewItem => ({
  id: `q${n}`,
  number: n,
  text: `${n}. sorunun metni`,
  outcome: OUTCOMES[(n - 1) % 3],
  options: [
    { id: `q${n}a`, text: "Birinci", chosen: n % 3 === 1, correct: true },
    { id: `q${n}b`, text: "İkinci", chosen: n % 3 === 2, correct: false },
    { id: `q${n}c`, text: "Üçüncü", chosen: false, correct: false },
  ],
  ...over,
});

const mount = async (items: ReviewItem[]) => {
  const { AnswerReview } = await import(
    "~/features/online-exams/components/answer-review"
  );
  return render(
    createElement(AnswerReview, {
      items,
      heading: "Cevapların",
      headingId: "answers",
      cardTestId: "answer",
    })
  );
};
const tiles = (host: HTMLElement) =>
  [
    ...host.querySelectorAll("[data-testid=answer-strip] button"),
  ] as HTMLElement[];
const cards = (host: HTMLElement) =>
  [...host.querySelectorAll("[data-testid=answer]")] as HTMLElement[];
const chip = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll("label, button")].find((el) =>
    el.textContent?.trim().startsWith(label)
  ) as HTMLElement;

afterEach(cleanup);

/** A pointer pressed on an element, as a click outside a card begins. */
const pointerDown = async (el: Element) => {
  await act(async () => {
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  });
};

describe("the answers' strip and cards (MDRS-248)", () => {
  it("draws a tile per question with its outcome in words, a glyph and a border", async () => {
    const host = await mount([item(1), item(2), item(3)]);
    const [right, wrong, blank] = tiles(host);
    expect(right.getAttribute("aria-label")).toBe("1. soru: Doğru");
    expect(wrong.getAttribute("aria-label")).toBe("2. soru: Yanlış");
    expect(blank.getAttribute("aria-label")).toBe("3. soru: Boş");
    for (const tile of [right, wrong, blank]) {
      expect(tile.querySelector("svg")).toBeTruthy();
    }
    // A blank tile is dashed: the colour is never the only cue.
    expect(blank.style.borderStyle).toBe("dashed");
    expect(right.style.borderStyle).toBe("solid");
  });

  it("lays the questions out as narrow cards in a grid, every option with its letter and the choice's letter filled", async () => {
    const host = await mount([item(1), item(2), item(3)]);
    const grid = host.querySelector("[data-testid=answer-grid]") as HTMLElement;
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).toContain("md:grid-cols-2");
    expect(grid.className).toContain("xl:grid-cols-3");
    // One fixed height for every card (app/tedris.css .answer-grid).
    expect(grid.className).toContain("answer-grid");
    expect(cards(host)[0].style.overflowWrap).toBe("anywhere");
    const wrong = cards(host)[1];
    // The outcome is the badge's; the choice is its letter, no "Senin seçimin".
    expect(wrong.textContent).not.toContain("Senin seçimin");
    expect(wrong.textContent).not.toContain("Doğru şık");
    const letters = [
      ...wrong.querySelectorAll("[data-testid=answer-option-letter]"),
    ].map((el) => el.textContent);
    expect(letters).toEqual(["A", "B", "C"]);
    const chosen = wrong.querySelector("[data-chosen=true]") as HTMLElement;
    expect(chosen.textContent).toContain("İkinci");
    expect(chosen.textContent).toContain("seçtiğin şık");
    expect(chosen.hasAttribute("data-correct")).toBe(false);
    const right = wrong.querySelector("[data-correct=true]") as HTMLElement;
    expect(right.textContent).toContain("Birinci");
    expect(right.querySelector(".answer-option__mark svg")).toBeTruthy();
    // A blank question has no filled letter and says it is blank.
    expect(cards(host)[2].querySelector("[data-chosen]")).toBeNull();
    expect(cards(host)[2].textContent).toContain("Boş");
    expect(cards(host)[2].textContent).toContain("Bu soruyu boş bıraktın.");
  });

  it("scrolls to the question a tile names and focuses its card", async () => {
    const scrolled = vi
      .spyOn(HTMLElement.prototype, "scrollIntoView")
      .mockImplementation(() => {});
    const host = await mount([item(1), item(2), item(3)]);
    await click(tiles(host)[2]);
    const target = cards(host)[2];
    expect(scrolled).toHaveBeenCalledTimes(1);
    expect(scrolled.mock.instances[0]).toBe(target);
    expect(document.activeElement).toBe(target);
    expect(target.dataset.targeted).toBe("true");
    expect(tiles(host)[2].getAttribute("aria-controls")).toBe(target.id);
    scrolled.mockRestore();
  });

  it("works with the filter: a tile of a hidden question shows all of them again", async () => {
    const scrolled = vi
      .spyOn(HTMLElement.prototype, "scrollIntoView")
      .mockImplementation(() => {});
    const host = await mount([item(1), item(2), item(3), item(4)]);
    await click(chip(host, "Yanlış"));
    expect(cards(host).map((c) => c.dataset.outcome)).toEqual(["wrong"]);
    // The strip keeps every question.
    expect(tiles(host)).toHaveLength(4);
    // A wrong one stays in the filtered list.
    await click(tiles(host)[1]);
    expect(cards(host)).toHaveLength(1);
    expect(document.activeElement).toBe(cards(host)[0]);
    // A correct one is hidden: the filter goes back to all, then it scrolls.
    await click(tiles(host)[3]);
    expect(cards(host)).toHaveLength(4);
    expect(document.activeElement).toBe(cards(host)[3]);
    expect(scrolled).toHaveBeenCalledTimes(2);
    scrolled.mockRestore();
  });

  it("draws an Arabic question, option and set by the standard, and only the Arabic run of a mixed text", async () => {
    const host = await mount([
      item(1, {
        text: "قَالَ زَيْدٌ",
        setTitle: "Emsile",
        options: [
          { id: "x", text: "Fiil: فَعَلَ", chosen: true, correct: true },
          { id: "y", text: "اِسْمٌ", chosen: false, correct: false },
          { id: "z", text: "اِسْمٌ ya da fiil", chosen: false, correct: true },
        ],
      }),
    ]);
    const card = cards(host)[0];
    const question = [...card.querySelectorAll("p")].find(
      (p) => p.textContent === "قَالَ زَيْدٌ"
    ) as HTMLElement;
    expect(question.getAttribute("lang")).toBe("ar");
    expect(question.getAttribute("dir")).toBe("rtl");
    expect(question.style.fontFamily).toBe("var(--font-arabic)");
    const run = [...card.querySelectorAll("[lang=ar]")].find(
      (el) => el.textContent === "فَعَلَ"
    ) as HTMLElement;
    // A text with a Latin letter states no direction: it takes the page's
    // (<html dir>, ltr in Turkish).
    expect(run.parentElement?.hasAttribute("dir")).toBe(false);
    expect(run.parentElement?.hasAttribute("data-mixed-arabic")).toBe(true);
    expect(run.parentElement?.getAttribute("lang")).toBeNull();
    // Arabic first, Turkish after: still the page's direction, only the
    // Arabic run is Naskh.
    const lead = [...card.querySelectorAll("[lang=ar]")].find(
      (el) => el.textContent === "اِسْمٌ"
    ) as HTMLElement;
    expect(lead.getAttribute("dir")).toBe("rtl");
    expect(lead.parentElement?.hasAttribute("dir")).toBe(false);
    expect(card.querySelector("[data-testid=answer-set]")?.textContent).toBe(
      "Set: Emsile"
    );
  });

  it("gives a mixed text the page's direction, and keeps a heading's weight on its Arabic", async () => {
    const { ArabicText, paragraphDir } = await import(
      "~/features/online-exams/components/arabic-text"
    );
    expect(paragraphDir("الْحَمْدُ لِلَّهِ hangi sûrenin ilk âyetidir?", "ltr")).toBe(
      "ltr"
    );
    expect(paragraphDir("مَا مَعْنَى X فِي الْآيَةِ؟", "ltr")).toBe("ltr");
    expect(paragraphDir("الْحَمْدُ لِلَّهِ", "ltr")).toBe("rtl");
    const host = await render(
      createElement(ArabicText, {
        as: "h1",
        text: "الصَّرْفُ",
        size: "var(--fs-h1)",
        weight: "var(--weight-medium)",
      })
    );
    const h1 = host.querySelector("h1") as HTMLElement;
    expect(h1.getAttribute("lang")).toBe("ar");
    expect(h1.style.fontWeight).toBe("var(--weight-medium)");
    expect(h1.style.lineHeight).toBe("var(--lh-arabic)");
  });

  it("drops the ring when the filter changes, and points only at cards that are shown", async () => {
    const scrolled = vi
      .spyOn(HTMLElement.prototype, "scrollIntoView")
      .mockImplementation(() => {});
    const host = await mount([item(1), item(2), item(3)]);
    await click(tiles(host)[0]);
    expect(cards(host)[0].dataset.targeted).toBe("true");
    await click(chip(host, "Doğru"));
    expect(host.querySelector("[data-targeted]")).toBeNull();
    expect(tiles(host)[0].getAttribute("aria-controls")).toBe(
      cards(host)[0].id
    );
    expect(tiles(host)[1].hasAttribute("aria-controls")).toBe(false);
    scrolled.mockRestore();
  });

  it("draws 500 questions without a virtual list, fast enough to click through", async () => {
    const scrolled = vi
      .spyOn(HTMLElement.prototype, "scrollIntoView")
      .mockImplementation(() => {});
    const items = Array.from({ length: 500 }, (_, i) => item(i + 1));
    const began = performance.now();
    const host = await mount(items);
    const drawn = performance.now() - began;
    expect(tiles(host)).toHaveLength(500);
    expect(cards(host)).toHaveLength(500);
    await click(tiles(host)[449]);
    expect(document.activeElement).toBe(cards(host)[449]);
    // Measured, not a budget for a slow machine: happy-dom draws it in well
    // under this on CI; the real browser's numbers are in the migration note.
    expect(drawn).toBeLessThan(5000);
    scrolled.mockRestore();
  });

  it("cuts a long card with Devamını göster, and lays it over its neighbours until Esc or a click outside", async () => {
    const long = `Aşağıdaki âyet Fâtiha sûresinin beşinci âyetidir:

إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ

${"Bu âyette kul, ibadetin yalnız Allah'a yapıldığını söyler. ".repeat(6)}

Bu âyetteki fiilin anlamı nedir?`;
    const host = await mount([item(1), item(2, { text: long }), item(3)]);
    const [short, tall, third] = cards(host);
    // A short card has no button and no cut.
    expect(short.querySelector("[data-testid=answer-card-more]")).toBeNull();
    expect(
      short
        .querySelector("[data-testid=answer-card-body]")
        ?.hasAttribute("data-clipped")
    ).toBe(false);
    const body = tall.querySelector(
      "[data-testid=answer-card-body]"
    ) as HTMLElement;
    const more = tall.querySelector(
      "[data-testid=answer-card-more]"
    ) as HTMLButtonElement;
    expect(body.dataset.clipped).toBe("true");
    expect(more.textContent).toBe("Devamını göster");
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(more.getAttribute("aria-controls")).toBe(body.id);
    // The text keeps its own lines.
    const text = tall.querySelector(
      "[data-testid=answer-question-text]"
    ) as HTMLElement;
    expect(text.className).toContain("answer-question");
    expect(text.textContent).toContain("\n");
    const cells = [
      ...host.querySelectorAll("[data-testid=answer-cell]"),
    ] as HTMLElement[];

    await click(more);
    expect(tall.dataset.expanded).toBe("true");
    expect(body.hasAttribute("data-clipped")).toBe(false);
    expect(more.textContent).toBe("Kapat");
    expect(more.getAttribute("aria-expanded")).toBe("true");
    // The card is laid over the grid from its own cell: every card stays in
    // its cell, in the same order, so nothing moves.
    expect(cells.map((c) => c.firstElementChild)).toEqual([short, tall, third]);
    // A click inside the card leaves it open.
    await pointerDown(body);
    expect(tall.dataset.expanded).toBe("true");
    // A click outside puts it back.
    await pointerDown(third);
    expect(tall.hasAttribute("data-expanded")).toBe(false);
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(body.dataset.clipped).toBe("true");

    // Esc puts it back, and the focus on its button.
    await click(more);
    expect(tall.dataset.expanded).toBe("true");
    await key(document.body, "Escape");
    expect(tall.hasAttribute("data-expanded")).toBe(false);
    expect(document.activeElement).toBe(more);
  });

  it("lays the open card over the others in the stylesheet, its cell keeping its place", () => {
    const css = readFileSync(`${__dirname}/../app/tedris.css`, "utf8");
    expect(css).toMatch(/\.answer-cell \{[^}]*position: relative;/);
    const open =
      /\.answer-card\[data-expanded\] \{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(open).toContain("position: absolute;");
    expect(open).toContain("z-index: 10;");
    expect(open).toContain("box-shadow: var(--elevation-overlay);");
  });

  it("opens one card at a time", async () => {
    const long = "Uzun bir soru metni. ".repeat(20);
    const host = await mount([
      item(1, { text: long }),
      item(2, { text: long }),
    ]);
    const [first, second] = cards(host);
    const moreOf = (card: HTMLElement) =>
      card.querySelector("[data-testid=answer-card-more]") as HTMLElement;
    await click(moreOf(first));
    expect(first.dataset.expanded).toBe("true");
    await pointerDown(moreOf(second));
    await click(moreOf(second));
    expect(first.hasAttribute("data-expanded")).toBe(false);
    expect(second.dataset.expanded).toBe("true");
  });

  it("counts a text as long by its paragraphs or its length", async () => {
    const { isLongText } = await import(
      "~/features/online-exams/components/answer-review"
    );
    expect(isLongText("Kısa bir soru?")).toBe(false);
    expect(isLongText("a\nb\nc\nd\ne\nf\ng")).toBe(true);
    expect(isLongText("x".repeat(281))).toBe(true);
  });

  it("guesses a heavy card by its question, its options' length or their count", async () => {
    const { isHeavy } = await import(
      "~/features/online-exams/components/answer-review"
    );
    const options = (texts: string[]) =>
      texts.map((text, i) => ({
        id: String(i),
        text,
        chosen: false,
        correct: i === 0,
      }));
    expect(isHeavy({ text: "Kısa?", options: options(["A", "B"]) })).toBe(
      false
    );
    expect(
      isHeavy({
        text: "Kısa?",
        options: options(["x".repeat(120), "y".repeat(120)]),
      })
    ).toBe(true);
    expect(
      isHeavy({
        text: "Kısa?",
        options: options(["1", "2", "3", "4", "5", "6"]),
      })
    ).toBe(true);
  });
});
