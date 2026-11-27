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

/** A desk (or not), and a sheet whose content is `content` px tall in a `box` px window. */
const lay = (desk: boolean, content: number, box: number) => {
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
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
    function (this: HTMLElement) {
      return this.classList.contains("take-body") ? content : 0;
    }
  );
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
    function (this: HTMLElement) {
      return this.classList.contains("take-body") ? box : 0;
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
