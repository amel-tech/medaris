// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { showsImamStar } from "../src/lib/imam-star";
import { ImamStar } from "../src/mds/imam-star";
import { cleanup, click, key, render, settle } from "./render";

/**
 * The imam's star (the owner's decision of 2026-10-13): a button named
 * "Dersin imamı" whose bubble says what the imam is, opened by a tap or a
 * click and by keyboard focus and closed by Esc; inside a link or a button,
 * a star that is no button and reads as words. Hover is Base UI's
 * `openOnHover`, which happy-dom cannot drive.
 */

afterEach(cleanup);

const labels = {
  title: "Dersin imamı",
  body: "Birden çok müderrisi olan derste müderrislerden biri imamdır; yetkileri diğer müderrislerle aynıdır.",
  mark: "dersin imamı",
};

const bubble = () =>
  document.querySelector(".mds-imam-star__bubble") as HTMLElement | null;

describe("ImamStar", () => {
  it("is a button named by the title, described by the text, drawing the filled star", async () => {
    const host = await render(<ImamStar labels={labels} />);
    const button = host.querySelector("button") as HTMLButtonElement;
    expect(button.getAttribute("aria-label")).toBe("Dersin imamı");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.className).toBe("mds-imam-star mds-imam-star--button");
    const description = document.getElementById(
      button.getAttribute("aria-describedby") ?? ""
    );
    expect(description?.textContent).toBe(labels.body);
    expect(description?.hidden).toBe(true);
    const svg = button.querySelector("svg") as SVGElement;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(bubble()).toBeNull();
  });

  it("opens the bubble on a click or a tap, with the title over the text, and closes it on the next", async () => {
    const host = await render(<ImamStar labels={labels} />);
    const button = host.querySelector("button") as HTMLButtonElement;
    // A press, as a browser orders it: the pointer goes down, the button takes
    // the focus, then the click. The focus of a press must not open it first,
    // or the click would close it again.
    await act(async () => {
      button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      button.focus();
    });
    await click(button);
    await settle();
    const open = bubble();
    expect(open?.getAttribute("role")).toBe("dialog");
    expect(open?.querySelector(".mds-imam-star__title")?.textContent).toBe(
      "Dersin imamı"
    );
    expect(open?.querySelector(".mds-imam-star__body")?.textContent).toBe(
      labels.body
    );
    expect(button.getAttribute("aria-expanded")).toBe("true");
    await click(button);
    await settle(60);
    expect(bubble()).toBeNull();
  });

  it("opens on keyboard focus without taking the focus, and Esc closes it", async () => {
    const host = await render(<ImamStar labels={labels} />);
    const button = host.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      button.focus();
    });
    await settle();
    expect(bubble()?.textContent).toContain(labels.body);
    expect(document.activeElement).toBe(button);
    await key(button, "Escape");
    await settle(60);
    expect(bubble()).toBeNull();
  });

  it("inside a link or a button is no button: the star for the eye, the words for a screen reader", async () => {
    const host = await render(
      <a href="/ders/1">
        Bina ve İzhar Şerhi <ImamStar labels={labels} interactive={false} />
      </a>
    );
    expect(host.querySelector("button")).toBeNull();
    const mark = host.querySelector(".mds-imam-star") as HTMLElement;
    expect(mark.tagName).toBe("SPAN");
    expect(mark.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(mark.querySelector(".mds-visually-hidden")?.textContent).toBe(
      " dersin imamı"
    );
    expect(bubble()).toBeNull();
  });
});

describe("showsImamStar", () => {
  it("marks the imam of a course with more than one müderris, and nobody else", () => {
    expect(showsImamStar(true, 2)).toBe(true);
    expect(showsImamStar(true, 1)).toBe(false);
    expect(showsImamStar(false, 3)).toBe(false);
    expect(showsImamStar(true, null)).toBe(false);
    expect(showsImamStar(true, undefined)).toBe(false);
  });
});
