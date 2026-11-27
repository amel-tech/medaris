// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { act, createElement, Fragment, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  QuestionListToggle,
  QuestionNavigator,
  ScrollPane,
  useQuestionList,
} from "~/features/online-exams/components/question-parts";
import { cleanup, click, key, render } from "./dom";

/**
 * The question screen on a desk (MDRS-248, tek ekran: "soru uzun olsa da
 * çözme ekranındaki tüm alanlar laptop ekranına kaydırmadan sığmalı"): from
 * 1024px the page does not scroll, the question and its options sit side by
 * side in panes of their own, and the question list is a drawer behind
 * "Sorular". The çalışma soruları and the online exam share it.
 */

afterEach(cleanup);

const css = readFileSync(`${__dirname}/../app/tedris.css`, "utf8");
/** The rules inside the desk's media query. */
const desk = (() => {
  const at = css.indexOf("@media (width >= 64rem) {\n  main:has(");
  return at === -1 ? "" : css.slice(at, css.indexOf("\n}\n", at));
})();

const pointerDown = async (el: Element) => {
  await act(async () => {
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  });
};

/** The bar's toggle, a pane, and the list, as a take screen draws them. */
function Harness() {
  const list = useQuestionList();
  const [index, setIndex] = useState(0);
  return createElement(
    Fragment,
    null,
    createElement(QuestionListToggle, { list, label: "Sorular" }),
    createElement(ScrollPane, {
      className: "take-question-pane",
      label: "Soru metni",
      watch: index,
      children: createElement("h2", null, `Soru ${index + 1}`),
    }),
    createElement(QuestionNavigator, {
      items: ["q1", "q2", "q3"].map((id) => ({ id, state: "unseen" as const })),
      index,
      onGo: setIndex,
      title: "Sorular",
      itemLabel: (n: number) => `${n}. soru`,
      list,
      closeLabel: "Kapat",
    })
  );
}

describe("the question screen on a desk (MDRS-248, tek ekran)", () => {
  it("fits the window from 1024px: the page holds still and the panes scroll", () => {
    expect(desk).not.toBe("");
    // The page is the window's height: the main gives way, so nothing runs past it.
    expect(desk).toMatch(
      /main:has\(> \.take-column\),[^{]*\{[^}]*flex: 1 1 0;[^}]*min-block-size: 0;/
    );
    expect(desk).toMatch(
      /\.take-column \{[^}]*flex: 1 1 0;[^}]*min-block-size: 0;/
    );
    // The question on one side, its options on the other, the buttons under both.
    expect(desk).toMatch(/\.take-body \{[^}]*display: grid;/);
    expect(desk).toContain('"head options"');
    expect(desk).toContain('"text options"');
    expect(desk).toContain('"nav nav"');
    expect(desk).toMatch(
      /\.take-question-pane,\s*\.take-options-pane \{[^}]*overflow-y: auto;/
    );
    // The buttons are in the grid's last row, not held to the screen's bottom.
    expect(desk).toMatch(
      /\.take-body > \.take-nav \{[^}]*grid-area: nav;[^}]*position: static;/
    );
    // The bar is one row.
    expect(desk).toMatch(/\.take-bar \{[^}]*flex-wrap: nowrap;/);
    // The list is a drawer, shown only while open.
    expect(desk).toMatch(/\.take-navigator \{[^}]*position: fixed;/);
    expect(desk).toMatch(
      /\.take-navigator:not\(\[data-open\]\) \{\s*display: none;/
    );
  });

  it("keeps the phone's page as it was: no toggle, the list at the end, the buttons held to the bottom", () => {
    const outside = css.slice(
      0,
      css.indexOf("@media (width >= 64rem) {\n  main:has(")
    );
    expect(outside).toMatch(
      /\.take-list-toggle,\s*\.take-navigator__close \{\s*display: none;/
    );
    const nav = /\n\.take-nav \{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(nav).toContain("position: sticky;");
  });

  it("opens the list from Sorular and closes it with Esc, Kapat, a click outside or a question picked", async () => {
    const host = await render(createElement(Harness));
    const toggle = host.querySelector(
      "[data-testid=take-list-toggle]"
    ) as HTMLButtonElement;
    const nav = host.querySelector("nav") as HTMLElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-controls")).toBe(nav.id);
    expect(nav.className).toContain("take-navigator");
    expect(nav.hasAttribute("data-open")).toBe(false);

    await click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(nav.dataset.open).toBe("true");
    // The focus goes to the current question.
    expect(document.activeElement?.getAttribute("aria-current")).toBe("step");
    await key(document.body, "Escape");
    expect(nav.hasAttribute("data-open")).toBe(false);
    expect(document.activeElement).toBe(toggle);

    await click(toggle);
    const close = [...nav.querySelectorAll("button")].find(
      (b) => b.textContent === "Kapat"
    ) as HTMLButtonElement;
    expect(close.className).toContain("take-navigator__close");
    await click(close);
    expect(nav.hasAttribute("data-open")).toBe(false);
    expect(document.activeElement).toBe(toggle);

    await click(toggle);
    await pointerDown(nav);
    expect(nav.dataset.open).toBe("true");
    await pointerDown(host.querySelector("h2") as HTMLElement);
    expect(nav.hasAttribute("data-open")).toBe(false);

    await click(toggle);
    await click(nav.querySelector("[aria-label='3. soru']") as HTMLElement);
    expect(nav.hasAttribute("data-open")).toBe(false);
    expect(host.querySelector("h2")?.textContent).toBe("Soru 3");
  });

  it("names a pane as a region of its own", async () => {
    const host = await render(createElement(Harness));
    const pane = host.querySelector(".take-question-pane") as HTMLElement;
    expect(pane.tagName).toBe("SECTION");
    expect(pane.getAttribute("aria-label")).toBe("Soru metni");
    // happy-dom lays nothing out: a pane that does not scroll takes no focus.
    expect(pane.hasAttribute("tabindex")).toBe(false);
  });
});
