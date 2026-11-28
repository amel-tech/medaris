// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuestionSheet } from "../src/mds/question-sheet";
import { cleanup, click, render } from "./render";

/**
 * The question as the talebe sees it (MDRS-248, ortak görünüm): tedris's
 * question screen and nazar's preview draw this one sheet. happy-dom lays
 * nothing out, so the heights the sheet measures are given by hand.
 */

afterEach(async () => {
  await cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const question = {
  answerMode: "SINGLE",
  options: [
    { id: "o1", text: "Yardım dileriz" },
    { id: "o2", text: "İbadet ederiz" },
  ],
};

const sheet = (props: Partial<Parameters<typeof QuestionSheet>[0]> = {}) => (
  <QuestionSheet
    head={<p>1. soru</p>}
    text="«نَعْبُدُ» fiilinin anlamı nedir?"
    textId="q"
    question={question}
    chosen={[]}
    onChoose={() => {}}
    legend="Şıklar"
    multiHint="Birden fazla doğru olabilir."
    questionPaneLabel="Soru metni"
    optionsPaneLabel="Şıklar"
    watch="q1"
    {...props}
  />
);

/**
 * A desk (or not), and a sheet `box` px tall whose last row in the flow ends
 * at `content` px; with `panel`, an absolutely placed child (a note's panel)
 * ends at `panel` px.
 */
const lay = (desk: boolean, content: number, box: number, panel = 0) => {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: desk,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList
  );
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      const bottom = this.classList.contains("take-body")
        ? box
        : this.hasAttribute("data-panel")
          ? panel
          : this.parentElement?.classList.contains("take-body")
            ? content
            : 0;
      return { bottom } as DOMRect;
    }
  );
};

const body = (host: HTMLElement) =>
  host.querySelector(".take-body") as HTMLElement;

describe("QuestionSheet", () => {
  it("draws the number line, the text and the option tiles, labelled by the text", async () => {
    const host = await render(sheet());
    const section = body(host);
    expect(section.getAttribute("aria-labelledby")).toBe("q");
    expect(section.querySelector("#q")?.className).toContain("take-question");
    expect(section.querySelector("#q [lang=ar]")?.textContent).toBe("«نَعْبُدُ»");
    expect(
      [...section.querySelectorAll(".take-option__letter")].map(
        (l) => l.textContent
      )
    ).toEqual(["A", "B"]);
    expect(section.querySelector(".take-options--grid")).not.toBeNull();
  });

  it("keeps the question above its options when it fits the window", async () => {
    lay(true, 500, 600);
    const host = await render(sheet({ fit: true }));
    expect(body(host).dataset.layout).toBe("stack");
  });

  it("turns side by side on a desk only when the question above its options runs past the window", async () => {
    lay(true, 900, 600);
    const host = await render(sheet({ fit: true }));
    expect(body(host).dataset.layout).toBe("split");
  });

  it("stays one column under 1024px whatever its height", async () => {
    lay(false, 900, 600);
    const host = await render(sheet({ fit: true }));
    expect(body(host).dataset.layout).toBe("stack");
  });

  it("does not count what is laid over it, such as an open note's panel", async () => {
    lay(true, 500, 600, 900);
    const host = await render(
      sheet({
        fit: true,
        head: (
          <>
            <p>1. soru</p>
            <div data-panel="" style={{ position: "absolute" }} />
          </>
        ),
      })
    );
    // The panel is in the head line, not a row of the sheet: still `stack`.
    expect(body(host).dataset.layout).toBe("stack");
  });

  it("measures nothing without `fit` (nazar's preview)", async () => {
    lay(true, 900, 600);
    const host = await render(sheet());
    expect(body(host).hasAttribute("data-layout")).toBe(false);
  });

  it("lays the hoca's ✓ over the correct tile, named, and takes no choice when read only", async () => {
    const onChoose = vi.fn();
    const host = await render(
      sheet({
        readOnly: true,
        onChoose,
        correct: { ids: ["o2"], label: "Doğru" },
      })
    );
    const section = body(host);
    expect(section.dataset.readonly).toBe("true");
    const marks = [...section.querySelectorAll("[data-correct-mark]")];
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toBe("✓ Doğru");
    expect(marks[0]?.closest(".mds-choice")?.textContent).toContain(
      "İbadet ederiz"
    );
    await click(section.querySelector(".mds-choice") as HTMLElement);
    expect(onChoose).not.toHaveBeenCalled();
    // The tiles are for the eye only, out of the tab order; a plain list
    // tells a screen reader the options and the correct one.
    expect(section.querySelector("[inert] .take-options")).not.toBeNull();
    expect(
      [...section.querySelectorAll("ol.mds-visually-hidden li")].map(
        (li) => li.textContent
      )
    ).toEqual(["A) Yardım dileriz", "B) İbadet ederiz (Doğru)"]);
  });

  it("is imported by both CSS entries, outside the layers", () => {
    const styles = join(__dirname, "../src/styles");
    for (const entry of ["medaris.css", "medaris-components.css"]) {
      expect(readFileSync(join(styles, entry), "utf8")).toMatch(
        /@import "\.\/mds\/question\.css";/
      );
    }
  });
});
