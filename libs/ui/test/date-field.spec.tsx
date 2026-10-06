// @vitest-environment happy-dom
import { DirectionProvider } from "@base-ui/react/direction-provider";
import { act, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DateField } from "../src/mds/date-field";
import { Field } from "../src/mds/field";
import { cleanup, click, render, settle } from "./render";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 8, 12, 0));
});
afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
});

const box = () => document.querySelector("input.mds-input") as HTMLInputElement;
const trigger = () =>
  document.querySelector(".mds-datefield__trigger") as HTMLButtonElement;
const popup = () => document.querySelector('[role="dialog"]');
const grid = () => document.querySelector('[role="grid"]') as HTMLElement;
const day = (iso: string) =>
  document.querySelector(`[data-date="${iso}"]`) as HTMLButtonElement;
const title = () =>
  (document.querySelector(".mds-calendar__title") as HTMLElement).textContent;

async function press(
  el: Element,
  k: string,
  init: KeyboardEventInit = {}
): Promise<KeyboardEvent> {
  const event = new KeyboardEvent("keydown", {
    key: k,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  await act(async () => {
    el.dispatchEvent(event);
  });
  return event;
}

/** Writes text into a controlled input the way React hears it. */
async function type(input: HTMLInputElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  await act(async () => {
    input.focus();
    setter?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function blur(input: HTMLInputElement) {
  await act(async () => {
    input.blur();
  });
}

async function openByButton() {
  await click(trigger());
  await settle(30);
}

function Controlled(props: {
  initial?: string;
  onChange?: (v: string) => void;
  min?: string;
  max?: string;
  name?: string;
}) {
  const [value, setValue] = useState(props.initial ?? "");
  return (
    <DateField
      locale="tr-TR"
      value={value}
      min={props.min}
      max={props.max}
      name={props.name}
      onChange={(v) => {
        setValue(v);
        props.onChange?.(v);
      }}
    />
  );
}

describe("DateField", () => {
  it("shows the value in the locale's numeric form, with the typing pattern as placeholder", async () => {
    await render(
      <DateField locale="tr-TR" value="2026-10-05" onChange={() => {}} />
    );
    expect(box().value).toBe("05.10.2026");
    expect(box().className).toBe("mds-input");
    expect(box().getAttribute("aria-haspopup")).toBe("dialog");
    expect(box().hasAttribute("name")).toBe(false);
    expect(trigger().getAttribute("aria-label")).toBe("Takvimi aç");
    expect(trigger().className).toContain("mds-btn--ghost");
    await cleanup();
    await render(<DateField locale="en-US" defaultValue="2026-10-05" />);
    expect(box().value).toBe("10/05/2026");
    await cleanup();
    await render(<DateField locale="tr-TR" />);
    expect(box().value).toBe("");
    expect(box().placeholder).toBe("GG.AA.YYYY");
  });

  it("takes its label, help and error from Field", async () => {
    await render(
      <Field label="Başlangıç" required error="Bir tarih seçin.">
        <DateField locale="tr-TR" required />
      </Field>
    );
    const label = document.querySelector("label.mds-label") as HTMLLabelElement;
    expect(label.htmlFor).toBe(box().id);
    expect(box().id).not.toBe("");
    expect(box().required).toBe(true);
    expect(box().getAttribute("aria-invalid")).toBe("true");
    const error = document.querySelector(".mds-error") as HTMLElement;
    expect(box().getAttribute("aria-describedby")).toContain(error.id);
  });

  it("opens a dialog with a Monday-first month grid, today and the value marked", async () => {
    await render(
      <DateField locale="tr-TR" value="2026-10-05" onChange={() => {}} />
    );
    expect(popup()).toBeNull();
    await openByButton();
    const dialog = popup() as HTMLElement;
    expect(dialog.getAttribute("aria-label")).toBe("Tarih seç");
    expect(dialog.className).toContain("mds-popup");
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(grid().getAttribute("aria-labelledby")).toBe(
      document.querySelector(".mds-calendar__title")?.id
    );
    expect(title()).toBe("Ekim 2026");
    const headers = Array.from(grid().querySelectorAll("th"));
    expect(headers.map((th) => th.textContent)).toEqual([
      "Pzt",
      "Sal",
      "Çar",
      "Per",
      "Cum",
      "Cmt",
      "Paz",
    ]);
    expect(headers[0]?.getAttribute("abbr")).toBe("Pazartesi");
    expect(headers[0]?.getAttribute("scope")).toBe("col");
    const firstRow = grid().querySelectorAll("tbody tr")[0] as HTMLElement;
    const cells = Array.from(firstRow.querySelectorAll("td"));
    expect(cells.slice(0, 3).every((td) => !td.querySelector("button"))).toBe(
      true
    );
    expect(cells[3]?.querySelector("button")?.dataset.date).toBe("2026-10-01");
    // the value: aria-selected on its cell, and it holds the focus
    expect(day("2026-10-05").closest("td")?.getAttribute("aria-selected")).toBe(
      "true"
    );
    expect(day("2026-10-05").tabIndex).toBe(0);
    expect(day("2026-10-06").tabIndex).toBe(-1);
    expect(document.activeElement).toBe(day("2026-10-05"));
    expect(day("2026-10-05").getAttribute("aria-label")).toBe(
      "5 Ekim 2026 Pazartesi"
    );
    // today
    expect(day("2026-10-08").getAttribute("aria-current")).toBe("date");
    expect(day("2026-10-05").hasAttribute("aria-current")).toBe(false);
    const prev = document.querySelector(
      '[aria-label="Önceki ay"]'
    ) as HTMLElement;
    expect(prev).not.toBeNull();
    expect(document.querySelector('[aria-label="Sonraki ay"]')).not.toBeNull();
    expect(
      Array.from(document.querySelectorAll(".mds-calendar__foot button")).map(
        (b) => b.textContent
      )
    ).toEqual(["Bugün"]);
  });

  it("starts the week where the locale does", async () => {
    await render(<DateField locale="en-US" defaultValue="2026-10-05" />);
    await openByButton();
    const headers = Array.from(grid().querySelectorAll("th"));
    expect(headers[0]?.getAttribute("abbr")).toBe("Sunday");
    expect(title()).toBe("October 2026");
  });

  it("moves the focus with the APG keys and picks with Enter", async () => {
    const onChange = vi.fn();
    await render(<Controlled initial="2026-10-05" onChange={onChange} />);
    await openByButton();
    const at = () => (document.activeElement as HTMLElement).dataset.date;
    await press(day("2026-10-05"), "ArrowRight");
    expect(at()).toBe("2026-10-06");
    expect(day("2026-10-06").tabIndex).toBe(0);
    await press(day("2026-10-06"), "ArrowDown");
    expect(at()).toBe("2026-10-13");
    await press(day("2026-10-13"), "ArrowLeft");
    expect(at()).toBe("2026-10-12");
    await press(day("2026-10-12"), "ArrowUp");
    expect(at()).toBe("2026-10-05");
    await press(day("2026-10-05"), "End");
    expect(at()).toBe("2026-10-11");
    await press(day("2026-10-11"), "Home");
    expect(at()).toBe("2026-10-05");
    // into the next month and back across its start
    await press(day("2026-10-05"), "PageDown");
    expect(at()).toBe("2026-11-05");
    expect(title()).toBe("Kasım 2026");
    await press(day("2026-11-05"), "PageUp", { shiftKey: true });
    expect(at()).toBe("2025-11-05");
    expect(title()).toBe("Kasım 2025");
    await press(day("2025-11-05"), "PageDown", { shiftKey: true });
    await press(day("2026-11-05"), "PageUp");
    await press(day("2026-10-05"), "ArrowUp");
    await press(day("2026-09-28"), "ArrowLeft");
    expect(at()).toBe("2026-09-27");
    expect(title()).toBe("Eylül 2026");
    expect(onChange).not.toHaveBeenCalled();
    await press(day("2026-09-27"), "Enter");
    await settle(30);
    expect(onChange).toHaveBeenCalledWith("2026-09-27");
    expect(popup()).toBeNull();
    expect(box().value).toBe("27.09.2026");
    expect(document.activeElement).toBe(box());
  });

  it("mirrors Left and Right in a right-to-left page", async () => {
    await render(
      <DirectionProvider direction="rtl">
        <DateField locale="tr-TR" value="2026-10-05" onChange={() => {}} />
      </DirectionProvider>
    );
    await openByButton();
    await press(day("2026-10-05"), "ArrowRight");
    expect((document.activeElement as HTMLElement).dataset.date).toBe(
      "2026-10-04"
    );
    await press(day("2026-10-04"), "ArrowLeft");
    await press(day("2026-10-05"), "ArrowLeft");
    expect((document.activeElement as HTMLElement).dataset.date).toBe(
      "2026-10-06"
    );
  });

  it("picks with a click and with the today button", async () => {
    const onChange = vi.fn();
    await render(<Controlled onChange={onChange} />);
    await openByButton();
    // nothing chosen: the focus starts on today
    expect(document.activeElement).toBe(day("2026-10-08"));
    await click(day("2026-10-20"));
    await settle(30);
    expect(onChange).toHaveBeenLastCalledWith("2026-10-20");
    expect(popup()).toBeNull();
    await openByButton();
    await click(
      document.querySelector(".mds-calendar__foot button") as HTMLElement
    );
    await settle(30);
    expect(onChange).toHaveBeenLastCalledWith("2026-10-08");
  });

  it("disables the days and months outside min and max", async () => {
    const onChange = vi.fn();
    await render(
      <Controlled
        initial="2026-10-10"
        min="2026-10-03"
        max="2026-10-20"
        onChange={onChange}
      />
    );
    await openByButton();
    expect(day("2026-10-02").getAttribute("aria-disabled")).toBe("true");
    expect(day("2026-10-21").getAttribute("aria-disabled")).toBe("true");
    expect(day("2026-10-03").hasAttribute("aria-disabled")).toBe(false);
    await click(day("2026-10-02"));
    await press(day("2026-10-02"), "Enter");
    expect(onChange).not.toHaveBeenCalled();
    expect(
      document
        .querySelector('[aria-label="Önceki ay"]')
        ?.getAttribute("aria-disabled")
    ).toBe("true");
    expect(
      document
        .querySelector('[aria-label="Sonraki ay"]')
        ?.getAttribute("aria-disabled")
    ).toBe("true");
    // today (8 October) is in range, so the today button is live
    expect(
      document
        .querySelector(".mds-calendar__foot button")
        ?.hasAttribute("aria-disabled")
    ).toBe(false);
  });

  it("reads typed dates on blur and Enter, and keeps the last valid one when it cannot", async () => {
    const onChange = vi.fn();
    const onBad = vi.fn();
    await render(
      <form>
        <DateField
          locale="tr-TR"
          name="start"
          defaultValue="2026-10-05"
          onChange={onChange}
          onBadInputChange={onBad}
          max="2026-12-31"
        />
      </form>
    );
    const hidden = document.querySelector(
      'input[type="hidden"][name="start"]'
    ) as HTMLInputElement;
    expect(hidden.value).toBe("2026-10-05");
    await type(box(), "7.10.2026");
    expect(onChange).not.toHaveBeenCalled();
    await blur(box());
    expect(onChange).toHaveBeenLastCalledWith("2026-10-07");
    expect(box().value).toBe("07.10.2026");
    expect(hidden.value).toBe("2026-10-07");

    await type(box(), "31.02.2026");
    const enter = await press(box(), "Enter");
    expect(enter.defaultPrevented).toBe(true);
    expect(box().getAttribute("aria-invalid")).toBe("true");
    expect(box().value).toBe("31.02.2026");
    expect(onBad).toHaveBeenLastCalledWith(true);
    expect(hidden.value).toBe("2026-10-07");
    expect(onChange).toHaveBeenCalledTimes(1);

    // outside max: not taken either
    await type(box(), "01.01.2027");
    await blur(box());
    expect(box().getAttribute("aria-invalid")).toBe("true");
    expect(hidden.value).toBe("2026-10-07");

    await type(box(), "08102026");
    await press(box(), "Enter");
    expect(onChange).toHaveBeenLastCalledWith("2026-10-08");
    expect(onBad).toHaveBeenLastCalledWith(false);
    expect(box().hasAttribute("aria-invalid")).toBe(false);

    await type(box(), "");
    await blur(box());
    expect(onChange).toHaveBeenLastCalledWith("");
    expect(hidden.value).toBe("");
  });

  it("Esc closes the calendar and returns the focus to the box", async () => {
    await render(
      <DateField locale="tr-TR" value="2026-10-05" onChange={() => {}} />
    );
    await openByButton();
    expect(document.activeElement).toBe(day("2026-10-05"));
    await press(day("2026-10-05"), "Escape");
    await settle(30);
    expect(popup()).toBeNull();
    expect(document.activeElement).toBe(box());
  });

  it("a click in the box opens the calendar and leaves the caret there; ArrowDown enters the grid", async () => {
    await render(
      <DateField locale="tr-TR" value="2026-10-05" onChange={() => {}} />
    );
    await act(async () => {
      box().focus();
    });
    await click(box());
    await settle(30);
    expect(popup()).not.toBeNull();
    expect(document.activeElement).toBe(box());
    await press(box(), "ArrowDown");
    await settle(30);
    expect(document.activeElement).toBe(day("2026-10-05"));
  });

  it("stays shut when disabled or read-only, and the hidden input follows disabled", async () => {
    await render(
      <DateField locale="tr-TR" name="d" defaultValue="2026-10-05" disabled />
    );
    expect(box().disabled).toBe(true);
    expect(trigger().disabled).toBe(true);
    expect(
      (document.querySelector('input[type="hidden"]') as HTMLInputElement)
        .disabled
    ).toBe(true);
    await cleanup();
    await render(
      <DateField locale="tr-TR" defaultValue="2026-10-05" readOnly />
    );
    expect(box().readOnly).toBe(true);
    await click(box());
    await press(box(), "ArrowDown");
    await settle(30);
    expect(popup()).toBeNull();
  });
});
