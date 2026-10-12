// @vitest-environment happy-dom
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurriculumOption } from "~/features/courses/components/session-curriculum";
import { cleanup, click, key, render, settle } from "./dom";

/**
 * The Müfredat combobox at the foot of the celse detail page (MDRS-289):
 * "müfredat listesi bi combobox olsun, tıklayınca dropdown açılsın (aşağıda
 * yer yoksa yukarıda) scrollview ile tüm müfredatı gezebilsin talebe". What
 * the page hands it is `session-page.spec.ts`; the side it opens on is
 * `popup-placement.spec.ts`.
 */

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

beforeEach(() => mocks.push.mockReset());
afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
});

const labels = {
  curriculum: "Müfredat",
  count: "50 celse",
  trigger: "Müfredat: Hafta 6 / 50, Celse 6",
  viewing: "Bu celse",
  weekOf: "Hafta 6 / 50",
  course: "Ders sayfasında aç",
  search: "Hafta ya da başlık ara",
  searchLabel: "Celse ara",
  noMatch: "Bu aramaya uyan celse yok.",
  done: ", sona erdi",
};

// Fifty weeks, one celse each: five done, the sixth on air and on the page.
const options: CurriculumOption[] = Array.from({ length: 50 }, (_, i) => ({
  id: `s${i + 1}`,
  href: `/courses/c1/lessons/s${i + 1}`,
  weekNumber: i + 1,
  week: `Hafta ${i + 1}`,
  title: i === 2 ? "Mehmûz fiiller" : `Celse ${i + 1}`,
  state: i < 5 ? "ended" : i === 5 ? "live" : "upcoming",
  meta: i === 5 ? ["7 Kas", "Bu celse", "Şu an canlı"] : [`${i + 1} Eki`],
  current: i === 5,
}));

const mount = async () => {
  const { SessionCurriculum } = await import(
    "~/features/courses/components/session-curriculum"
  );
  await render(
    createElement(SessionCurriculum, {
      options,
      title: "Celse 6",
      progress: 12,
      courseHref: "/courses/c1?tab=mufredat",
      locale: "tr",
      labels,
    })
  );
  return document.querySelector(
    '[data-testid="session-curriculum"] > button'
  ) as HTMLButtonElement;
};

const listbox = () =>
  document.querySelector('[role="listbox"]') as HTMLElement | null;
const rows = () => [
  ...document.querySelectorAll<HTMLElement>('[role="option"]'),
];
/** The row the keys act on: the one in the tab order, drawn highlighted. */
const activeRow = () => {
  const active = rows().filter((row) => row.tabIndex === 0);
  expect(active.length).toBeLessThanOrEqual(1);
  expect(rows().filter((row) => row.hasAttribute("data-highlighted"))).toEqual(
    active
  );
  return active[0] ?? null;
};
/** A key pressed where the focus is. */
const press = (k: string) => key(document.activeElement as Element, k);
const searchField = () =>
  document.querySelector('input[type="search"]') as HTMLInputElement;
const type = async (value: string) => {
  const input = searchField();
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const open = async () => {
  const button = await mount();
  await click(button);
  return button;
};

describe("the Müfredat combobox (MDRS-289)", () => {
  it("is a closed button that names the programme and this celse", async () => {
    const button = await mount();
    expect(button.getAttribute("aria-haspopup")).toBe("listbox");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.hasAttribute("aria-controls")).toBe(false);
    expect(button.getAttribute("aria-label")).toBe(labels.trigger);
    expect(button.textContent).toContain("Müfredat");
    expect(button.textContent).toContain("Celse 6");
    expect(button.textContent).toContain("Hafta 6 / 50");
    expect(listbox()).toBeNull();
  });

  it("opens on a click with every celse, this one selected and focused", async () => {
    const button = await open();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.getAttribute("aria-controls")).toBe(listbox()?.id);
    expect(listbox()?.getAttribute("aria-label")).toBe("Müfredat");
    expect(rows()).toHaveLength(50);
    expect(
      rows()
        .filter((row) => row.getAttribute("aria-selected") === "true")
        .map((row) => row.dataset.option)
    ).toEqual(["s6"]);
    expect(rows()[0].getAttribute("aria-selected")).toBe("false");
    expect(activeRow()).toBe(rows()[5]);
    expect(document.activeElement).toBe(rows()[5]);
  });

  it("heads the list with its count, the course page's programme and a search field", async () => {
    await open();
    const popup = listbox()?.parentElement as HTMLElement;
    expect(popup.textContent).toContain("Müfredat·50 celse");
    expect(
      popup.querySelector('a[href="/courses/c1?tab=mufredat"]')?.textContent
    ).toBe(labels.course);
    expect(searchField().placeholder).toBe(labels.search);
    expect(searchField().getAttribute("aria-controls")).toBe(listbox()?.id);
    expect(
      document.querySelector(`label[for="${searchField().id}"]`)?.textContent
    ).toBe(labels.searchLabel);
  });

  it("says where each celse stands", async () => {
    await open();
    expect(rows()[0].dataset.state).toBe("ended");
    expect(rows()[0].textContent).toContain("Celse 1, sona erdi");
    expect(rows()[5].dataset.state).toBe("live");
    expect(rows()[5].textContent).toContain("7 Kas· Bu celse· Şu an canlı");
    expect(rows()[6].dataset.state).toBe("upcoming");
    expect(rows()[6].textContent).not.toContain("sona erdi");
  });

  it("moves with the arrows, Home and End, and goes to the celse with Enter", async () => {
    const button = await open();
    await press("ArrowDown");
    expect(activeRow()).toBe(rows()[6]);
    expect(document.activeElement).toBe(rows()[6]);
    await press("End");
    expect(activeRow()).toBe(rows()[49]);
    await press("Home");
    expect(activeRow()).toBe(rows()[0]);
    await press("ArrowUp");
    expect(activeRow()).toBe(rows()[0]);
    expect(document.activeElement).toBe(rows()[0]);
    await press("Enter");
    expect(mocks.push).toHaveBeenCalledWith("/courses/c1/lessons/s1");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(listbox()).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("goes with Space, and with a click on a row", async () => {
    const button = await open();
    await press("ArrowDown");
    await press(" ");
    expect(mocks.push).toHaveBeenLastCalledWith("/courses/c1/lessons/s7");
    await click(button);
    await click(rows()[9].querySelector("span") as HTMLElement);
    expect(mocks.push).toHaveBeenLastCalledWith("/courses/c1/lessons/s10");
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("only closes when this celse is chosen", async () => {
    const button = await open();
    await press("Enter");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
  });

  it("filters by week number or title as the talebe types, and Enter goes to the first", async () => {
    await open();
    await type("3");
    expect(rows().map((row) => row.dataset.option)).toEqual(["s3"]);
    await type("mehmuz");
    expect(rows().map((row) => row.dataset.option)).toEqual(["s3"]);
    await type("celse 4");
    expect(rows().map((row) => row.dataset.option)).toEqual(["s4"]);
    expect(activeRow()).toBe(rows()[0]);
    await type("");
    expect(rows()).toHaveLength(50);
    expect(activeRow()).toBe(rows()[5]);
    await type("hafta 12");
    await key(searchField(), "Enter");
    expect(mocks.push).toHaveBeenCalledWith("/courses/c1/lessons/s12");
  });

  it("says so when nothing matches", async () => {
    await open();
    await type("zzz");
    expect(rows()).toHaveLength(0);
    expect(document.body.textContent).toContain(labels.noMatch);
    await key(searchField(), "Enter");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("starts a search from a letter typed in the list, and comes back to the list with an arrow", async () => {
    await open();
    await press("m");
    expect(searchField().value).toBe("m");
    expect(document.activeElement).toBe(searchField());
    expect(rows().map((row) => row.dataset.option)).toEqual(["s3"]);
    await press("ArrowDown");
    expect(document.activeElement).toBe(rows()[0]);
    expect(activeRow()).toBe(rows()[0]);
  });

  it("closes on Escape, from the list or the search field, and gives the focus back to the button", async () => {
    const button = await open();
    await press("Escape");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(listbox()).toBeNull();
    expect(document.activeElement).toBe(button);
    await click(button);
    searchField().focus();
    await press("Escape");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
  });

  it("closes on a click outside, the focus back on the button when the click lands on nothing focusable", async () => {
    const button = await open();
    await act(async () => {
      document.body.dispatchEvent(
        new Event("pointerdown", { bubbles: true, cancelable: true })
      );
    });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(listbox()).toBeNull();
    await settle();
    expect(document.activeElement).toBe(button);
  });

  it("stays open for a click inside it", async () => {
    const button = await open();
    await act(async () => {
      searchField().dispatchEvent(
        new Event("pointerdown", { bubbles: true, cancelable: true })
      );
    });
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("opens from the keyboard with ArrowDown on the button", async () => {
    const button = await mount();
    button.focus();
    await key(button, "ArrowDown");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(rows()[5]);
  });

  it("opens above when the button sits too low for the list below, and measures again on resize", async () => {
    const button = await mount();
    const rect = (top: number) =>
      ({
        top,
        bottom: top + 80,
        left: 0,
        right: 600,
        width: 600,
        height: 80,
      }) as DOMRect;
    const measured = vi
      .spyOn(button, "getBoundingClientRect")
      .mockReturnValue(rect(window.innerHeight - 60));
    await click(button);
    const popup = () => listbox()?.parentElement as HTMLElement;
    expect(popup().dataset.side).toBe("above");
    expect(popup().className).toContain("inset-be-[calc(100%+var(--space-2))]");
    measured.mockReturnValue(rect(40));
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(popup().dataset.side).toBe("below");
    expect(popup().className).toContain("inset-bs-[calc(100%+var(--space-2))]");
  });
});
