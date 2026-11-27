// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { createElement, Fragment, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewItem } from "~/features/online-exams/components/answer-review";
import {
  optionsLayout,
  QuestionOptions,
  SHORT_OPTION,
  TakeKeys,
} from "~/features/online-exams/components/question-parts";
import { cleanup, click, key, render } from "./dom";
import { intlMock } from "./intl-mock";

/** The question sheet's look, shared by tedris and nazar (MDRS-248, ortak görünüm). */
const SHEET_CSS = `${__dirname}/../../../libs/ui/src/styles/mds/question.css`;

/**
 * The option tiles of the question screen and the equal answer cards of the
 * result (MDRS-248, the owner: "şıkları kare halinde mi yapsak aynı hizada
 * kalabilmeleri için"; "kartlar aynı genişlik yüksekliğe sahip değil").
 */

vi.mock("next-intl", async (orig) => intlMock(await orig()));
vi.mock("~/features/question-notes/actions", () => ({
  saveMyQuestionNote: vi.fn(),
  deleteMyQuestionNote: vi.fn(),
}));

const question = (answerMode: string, texts: string[]) => ({
  answerMode,
  options: texts.map((text, i) => ({ id: `o${i}`, text })),
});

/** The options with their state kept, and the screen's keys on them. */
function Harness({ q }: { q: ReturnType<typeof question> }) {
  const [chosen, setChosen] = useState<string[]>([]);
  return createElement(
    Fragment,
    null,
    createElement(QuestionOptions, {
      question: q,
      chosen,
      onChoose: setChosen,
      legend: "Şıklar",
      multiHint: "Birden fazla doğru olabilir.",
    }),
    createElement(TakeKeys, {
      question: q,
      chosen,
      onChoose: setChosen,
      onEnter: () => {},
    })
  );
}

const tiles = (host: HTMLElement) =>
  [...host.querySelectorAll(".take-options .mds-choice")] as HTMLElement[];
const control = (tile: HTMLElement) =>
  tile.querySelector("[role=radio], [role=checkbox]") as HTMLElement;

afterEach(cleanup);

describe("the option tiles (MDRS-248)", () => {
  it("lays short options out as a 2×2 grid and any long one as a single column", () => {
    expect(optionsLayout([{ text: "Elif" }, { text: "Be" }])).toBe("grid");
    expect(optionsLayout([{ text: "a".repeat(SHORT_OPTION) }])).toBe("grid");
    expect(
      optionsLayout([{ text: "Elif" }, { text: "a".repeat(SHORT_OPTION + 1) }])
    ).toBe("list");
    // Arabic is counted in characters as it reads, not in UTF-16 units.
    expect(optionsLayout([{ text: "كِتَابٌ" }, { text: "قَلَمٌ" }])).toBe("grid");
  });

  it("is a radio group underneath, the tile chosen by a click, with no visible control", async () => {
    const host = await render(
      createElement(Harness, {
        q: question("SINGLE", ["Elif", "Be", "Te", "Se"]),
      })
    );
    const group = host.querySelector(".take-options") as HTMLElement;
    expect(group.getAttribute("role")).toBe("radiogroup");
    expect(group.classList.contains("take-options--grid")).toBe(true);
    expect(tiles(host)).toHaveLength(4);
    expect(
      tiles(host).map(
        (t) => t.querySelector(".take-option__letter")?.textContent
      )
    ).toEqual(["A", "B", "C", "D"]);
    await click(tiles(host)[1]);
    expect(control(tiles(host)[1]).getAttribute("aria-checked")).toBe("true");
    await click(tiles(host)[2]);
    expect(control(tiles(host)[1]).getAttribute("aria-checked")).toBe("false");
    expect(control(tiles(host)[2]).getAttribute("aria-checked")).toBe("true");
    // No hint over a single-answer question.
    expect(host.querySelector(".take-options__hint")).toBeNull();
  });

  it("takes more than one tile on a MULTIPLE question and says so", async () => {
    const host = await render(
      createElement(Harness, {
        q: question("MULTIPLE", [
          "Elif",
          "Bu şık otuz iki karakterden kesinlikle daha uzun",
        ]),
      })
    );
    const group = host.querySelector(".take-options") as HTMLElement;
    expect(group.classList.contains("take-options--list")).toBe(true);
    const hint = host.querySelector(".take-options__hint") as HTMLElement;
    expect(hint.textContent).toBe("Birden fazla doğru olabilir.");
    expect(group.getAttribute("aria-describedby")).toBe(hint.id);
    await click(tiles(host)[0]);
    await click(tiles(host)[1]);
    expect(
      tiles(host).map((t) => control(t).getAttribute("aria-checked"))
    ).toEqual(["true", "true"]);
  });

  it("keeps the 1–9 and A–Z shortcuts", async () => {
    const host = await render(
      createElement(Harness, {
        q: question("SINGLE", ["Elif", "Be", "Te", "Se"]),
      })
    );
    await key(document.body, "3");
    expect(control(tiles(host)[2]).getAttribute("aria-checked")).toBe("true");
    await key(document.body, "d");
    expect(control(tiles(host)[3]).getAttribute("aria-checked")).toBe("true");
  });

  it("styles the tiles as a grid with the control hidden from sight only", () => {
    // The sheet's look is @medaris/ui's, shared with nazar's preview (ortak görünüm).
    const css = readFileSync(SHEET_CSS, "utf8");
    expect(css).toMatch(/\.take-options \{[^}]*display: grid;/);
    // Each tile as tall as its own text in one column; in the 2×2 grid the
    // two tiles of a row stretch to each other, not to the tallest tile of
    // the group (uzun soru).
    expect(css).not.toMatch(/grid-auto-rows: 1fr/);
    expect(css).toMatch(
      /\.take-options--grid \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/
    );
    expect(css).toMatch(/clip-path: inset\(50%\)/);
    expect(css).toMatch(/content: "✓"/);
  });
});

describe("a long question on the question screen (MDRS-248, uzun soru)", () => {
  const css = readFileSync(`${__dirname}/../app/tedris.css`, "utf8");

  it("keeps the question's own lines and wraps it in the reading column", () => {
    const sheet = readFileSync(SHEET_CSS, "utf8");
    expect(sheet).toMatch(/\.take-question \{[^}]*white-space: pre-line;/);
    expect(sheet).toMatch(/\.take-question \{[^}]*overflow-wrap: anywhere;/);
  });

  it("holds the buttons to the bottom of the screen on every width", () => {
    // Outside any media query: "Sonraki" in reach when a long question and
    // its options run past the screen, on a desk as on a phone.
    const nav = /\n\.take-nav \{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(nav).toContain("position: sticky;");
    expect(nav).toContain("inset-block-end: 0;");
    expect(nav).toContain("background: var(--background-neutral-surface);");
  });

  it("lays long options out in one column", async () => {
    const { optionsLayout } = await import(
      "~/features/online-exams/components/question-parts"
    );
    const long = "Rahmân ve Rahîm olan Allah'ın adıyla. ".repeat(4);
    expect(optionsLayout([{ text: long }, { text: "Kısa" }])).toBe("list");
  });
});

describe("the answer cards (MDRS-248, tek ekran)", () => {
  it("gives every card one fixed height and marks the choice by its letter", async () => {
    const { AnswerReview } = await import(
      "~/features/online-exams/components/answer-review"
    );
    const items: ReviewItem[] = [1, 2].map((n) => ({
      id: `q${n}`,
      number: n,
      text: n === 1 ? "Kısa" : "Çok uzun bir soru metni ".repeat(10),
      outcome: "wrong",
      options: [
        { id: `q${n}a`, text: "Birinci", chosen: true, correct: false },
        { id: `q${n}b`, text: "İkinci", chosen: false, correct: true },
      ],
    }));
    const host = await render(
      createElement(AnswerReview, {
        items,
        heading: "Cevapların",
        headingId: "answers",
        cardTestId: "answer",
      })
    );
    const grid = host.querySelector("[data-testid=answer-grid]") as HTMLElement;
    expect(grid.className).toContain("answer-grid");
    for (const card of host.querySelectorAll("[data-testid=answer]")) {
      expect(card.className).toContain("answer-card");
      expect(card.parentElement?.className).toContain("answer-cell");
    }
    const css = readFileSync(`${__dirname}/../app/tedris.css`, "utf8");
    // One row height for all: no card half empty beside a full one.
    expect(css).toMatch(/\.answer-grid \{\s*grid-auto-rows: \d+(\.\d+)?rem;/);
    expect(css).toMatch(/\.answer-card \{[^}]*block-size: 100%;/);
    expect(css).toMatch(/\.answer-card__body \{[^}]*overflow: hidden;/);
    // The letter in front of every option; the choice's filled, the correct one ✓.
    const row = host.querySelector("[data-chosen=true]") as HTMLElement;
    expect(
      row.querySelector("[data-testid=answer-option-letter]")?.textContent
    ).toBe("A");
    expect(row.className).toContain("answer-option");
    expect(css).toMatch(
      /\.answer-option\[data-chosen\] \.answer-option__letter \{/
    );
    const right = host.querySelector("[data-correct=true]") as HTMLElement;
    expect(
      right.querySelector("[data-testid=answer-option-letter]")?.textContent
    ).toBe("B");
    expect(right.querySelector(".answer-option__mark svg")).toBeTruthy();
  });
});
