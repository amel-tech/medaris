// @vitest-environment happy-dom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewItem } from "~/features/online-exams/components/answer-review";
import { cleanup, click, render } from "./dom";
import { intlMock } from "./intl-mock";

/**
 * The answers of a finished çalışma attempt and of a past exam (MDRS-248):
 * the numbered strip, the filter and the narrow cards, shared by both.
 */

vi.mock("next-intl", async (orig) => intlMock(await orig()));

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

  it("lays the questions out as narrow cards in a grid, each with only the choice and the correct option", async () => {
    const host = await mount([item(1), item(2), item(3)]);
    const grid = host.querySelector("[data-testid=answer-grid]") as HTMLElement;
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).toContain("md:grid-cols-2");
    expect(grid.className).toContain("xl:grid-cols-3");
    // As tall as its own text, and a long word wraps rather than widen it.
    expect(grid.className).toContain("items-start");
    expect(cards(host)[0].style.overflowWrap).toBe("anywhere");
    const wrong = cards(host)[1];
    expect(wrong.textContent).toContain("İkinci");
    expect(wrong.textContent).toContain("Senin seçimin");
    expect(wrong.textContent).toContain("Doğru şık");
    expect(wrong.textContent).not.toContain("Üçüncü");
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
    expect(run.parentElement?.getAttribute("dir")).toBe("ltr");
    expect(run.parentElement?.hasAttribute("data-mixed-arabic")).toBe(true);
    expect(run.parentElement?.getAttribute("lang")).toBeNull();
    // Arabic first, Turkish after: still the page's direction, only the
    // Arabic run is Naskh.
    const lead = [...card.querySelectorAll("[lang=ar]")].find(
      (el) => el.textContent === "اِسْمٌ"
    ) as HTMLElement;
    expect(lead.getAttribute("dir")).toBe("rtl");
    expect(lead.parentElement?.getAttribute("dir")).toBe("ltr");
    expect(card.querySelector("[data-testid=answer-set]")?.textContent).toBe(
      "Set: Emsile"
    );
  });

  it("gives a mixed text the direction it ends in, and keeps a heading's weight on its Arabic", async () => {
    const { ArabicText, mixedDir } = await import(
      "~/features/online-exams/components/arabic-text"
    );
    expect(mixedDir("الْحَمْدُ لِلَّهِ hangi sûrenin ilk âyetidir?")).toBe("ltr");
    expect(mixedDir("مَا مَعْنَى X فِي الْآيَةِ؟")).toBe("rtl");
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
});
